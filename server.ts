import "dotenv/config";
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';

// Set up Multer for handling file uploads (in memory)
const upload = multer({ storage: multer.memoryStorage() });

function sanitizeErrorMessage(message: string): string {
  const lowercase = String(message || '').toLowerCase();
  if (
    lowercase.includes('gemini_api_key') || 
    lowercase.includes('api_key') || 
    lowercase.includes('key is missing') ||
    lowercase.includes('invalid api key') ||
    lowercase.includes('api key not found')
  ) {
    return 'AI 暂时不可用，请稍后重试 (AI service is temporarily unavailable. Please try again later.)';
  }
  return message;
}

async function startServer() {
  const app = express();
  // Hosting platforms (Cloud Run, Render, Railway, Fly) inject the port via env.
  // Falling back to 3000 keeps local dev unchanged.
  const PORT = Number(process.env.PORT) || 3000;
  
  app.use(express.json({ limit: '25mb' }));

  // Initialize Gemini lazy
  let ai: GoogleGenAI | null = null;
  const getAi = () => {
    if (!ai) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing');
      }
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return ai;
  };

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  async function generateWithRetry(request: any): Promise<any> {
    const aiClient = getAi();
    const maxRetries = 5;
    const TIMEOUT_MS = 30000;
    
    for (let i = 0; i < maxRetries; i++) {
      let timeoutId: any;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('TIMEOUT_RETRYABLE')), TIMEOUT_MS);
        });
        
        return await Promise.race([
          aiClient.models.generateContent(request),
          timeoutPromise
        ]);
      } catch (e: any) {
        const msg = String(e.message || '');
        const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
        const isOverloaded = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('TIMEOUT_RETRYABLE') || msg.includes('fetch failed') || msg.includes('high demand') || msg.includes('overloaded');
        
        if (!isQuota && !isOverloaded) throw e;
        if (isQuota) {
          throw new Error("AI API rate limit (quota) exceeded. Please check your billing details or try again later.");
        }
        
        if (i === maxRetries - 1) {
          throw new Error(`The AI service is temporarily busy. Last error: ${msg}. Please try again in a few seconds.`);
        }
        
        const waitTime = Math.min(2000 * Math.pow(2, i), 8000);
        console.log(`AI busy, retrying in ${waitTime}ms (attempt ${i + 1}/${maxRetries})`);
        await delay(waitTime);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
  }

  // API Route: AI Observation (Wound/Excrement)
  app.post('/api/vision', upload.single('observationImage'), async (req, res) => {
    try {
      const language = req.body.language || "en";
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
      }


      const prompt = `
        You are an AI assistant in an aged care facility. 
        First determine whether the image shows a "wound"/skin injury or "excrement" (stool/urine).
        CRITICAL: NEVER give a medical diagnosis. Only describe observations and potential risks.
        
        If it is a WOUND, return structured JSON with the following keys exactly:
        - observationType: "wound"
        - observation: A detailed string describing what you see.
        - estimatedSizeOrType: A string for estimated size/shape (visual only).
        - potentialRiskFlag: A concise string describing the potential risk.
        - suggestedCarePlan: A string providing a suggested temporary dressing/first aid care plan based on standard Australian aged care clinical wound guidelines. Specify that this is a temporary suggestion until RN arrival.
        
        If it is EXCREMENT, return structured JSON with the following keys exactly:
        - observationType: "excrement"
        - observation: A plain descriptive string of what is visible.
        - colour: The observed colour.
        - bristolStoolType: Type 1-7 based on the Bristol Stool Chart, or 'unclear'.
        - potentialRiskFlag: A concise description of POTENTIAL risk (e.g. GI bleeding).

        CRITICAL LANGUAGE INSTRUCTION: The values for observation, estimatedSizeOrType, potentialRiskFlag, suggestedCarePlan, colour, and bristolStoolType MUST be written in the language corresponding to language code: ${language}. Only the keys must remain in English.
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: {
          parts: [
            { text: prompt },
            { 
              inlineData: {
                data: req.file.buffer.toString('base64'),
                mimeType: req.file.mimetype.includes('image/') ? req.file.mimetype : 'image/jpeg',
              }
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              observationType: { type: Type.STRING },
              observation: { type: Type.STRING },
              estimatedSizeOrType: { type: Type.STRING },
              colour: { type: Type.STRING },
              bristolStoolType: { type: Type.STRING },
              potentialRiskFlag: { type: Type.STRING },
              suggestedCarePlan: { type: Type.STRING }
            },
            required: ["observationType", "observation", "potentialRiskFlag"]
          },
          temperature: 0.2
        }
      });

      let rawText = response.text || '';
      let parsedResult;
      try {
        const jsonMatch = rawText.match(/\r?\n\`\`\`json\s*([\s\S]*?)\s*\`\`\`/g);
        if (jsonMatch && jsonMatch.length > 0) {
          const lastMatch = jsonMatch[jsonMatch.length - 1];
          const innerJson = lastMatch.replace(/\`\`\`json/, '').replace(/\`\`\`/, '').trim();
          parsedResult = JSON.parse(innerJson);
        } else {
          let cleaned = rawText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`/g, '').trim();
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          parsedResult = JSON.parse(cleaned);
        }
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Raw string:', rawText);
        return res.status(500).json({ error: 'Failed to parse AI response. Raw output: ' + rawText });
      }

      res.json({ result: parsedResult });
    } catch (error: any) {
      console.error('Vision API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to process AI observation');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // API Route: Audio Care Note Translation
  app.post('/api/audio-note', upload.single('audioRecording'), async (req, res) => {
    try {
      const language = req.body.language || "en";
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded' });

      }



      const prompt = `
        You are a professional Registered Nurse and Compliance Officer in an Australian aged care facility.
        Please listen to the following voice recording (which may be in any language, e.g., Chinese, Tagalog, Spanish, basic or broken English).
        
        1. Translate and interpret the core events described.
        2. Transform the raw description into a highly professional, clinical, and objective aged care progress note.
        3. Use standard clinical terminology. Focus purely on facts, interventions, and outcomes.
        
        CRITICAL ANTI-FABRICATION RULE: You must ONLY document facts, actions, and interventions that the carer EXPLICITLY stated in the recording. DO NOT invent, assume, or add any facts, vitals, assessments, notifications, or follow-up actions that were not stated.
        
        Specifically FORBIDDEN unless explicitly mentioned by the carer: notifying family/next of kin, notifying GP or medical officer, commencing neurological observations, taking vital signs, completing incident reports.
        
        If a standard follow-up action would normally be expected but was NOT mentioned (e.g. neuro obs after a head strike), do NOT write it into the note. Instead, output it in a separate new JSON field called "suggestedFollowUps" (array of short strings), so the RN can see what still needs to be done.
        
        CRITICAL TASK: Detect the language spoken in the audio recording. If it is NOT English (e.g. it is Mandarin), translate the final English note back into that detected language as a 'nativeConfirmation' so the carer can verify the record. If the audio is in English, leave it empty.
        
        SIRS & ACQSC COMPLIANCE (CRITICAL): 
        Analyze if the described event constitutes a Serious Incident Response Scheme (SIRS) reportable incident under the Aged Care Quality and Safety Commission (ACQSC) guidelines.
        Specifically: If the incident involves a "fall with injury" (e.g., hitting head, bleeding, pain requiring medical attention, or death), it MUST be classified as:
        - Priority: 1
        - Timeframe: 24 hours
        - actWarning: "Aged Care Act 1997 / ACQSC Guidelines: Priority 1 incidents (e.g. falls with serious injury, head strikes, fractures, unexpected death, unreasonable use of force) MUST be reported to the Commission within 24 hours. Attempting to downgrade a confirmed serious injury is a compliance breach and strictly prohibited."
        - lockDowngrade: true

        CATEGORY CLASSIFICATION RULES:
        - Do NOT classify an accidental fall as "Neglect". Neglect means a failure to provide required care (e.g. ignoring a resident, withholding food/medication).
        - An accidental fall that results in injury, including falls that occur while staff are actively assisting the resident, MUST be categorised as "Fall resulting in injury".
        - Only use "Neglect" when the carer's description explicitly indicates care was withheld or the resident was left unattended when supervision was required.
        
        Also, extract any Activities of Daily Living (ADL) updates if the audio explicitly mentions them.
        Return 'adlUpdates' with:
        - bathStatus: "done" if bathed, "due" if needs bath
        - mealStatus: "eaten" if they ate, "missed" if they refused, "assisted" if helped
        - toiletStatus: "independent" if they used toilet themselves, "assisted" if helped, "pad-change" if pad changed
        If an ADL is not mentioned, omit the field.

        CRITICAL LANGUAGE INSTRUCTION: The values for suggestedFollowUps MUST be written in the language corresponding to language code: ${language}. The englishNote and autofillReport fields MUST always be written in professional English.
        Return your response in structured JSON format with these exact keys:
        - englishNote: string (the professional progress note in English)
        - nativeConfirmation: string (the translated confirmation in the carer's native language)
        - adlUpdates: object (optional, containing bathStatus, mealStatus, toiletStatus)
        - suggestedFollowUps: array of strings (e.g., ["Commence neurological observations", "Notify Next of Kin", "Notify Medical Officer"], empty array if none)
        - sirsAssessment: object or null. If reportable, provide: 
          { 
            isReportable: true, 
            category: string, 
            priority: number (1 or 2),
            timeframe: string ("24 hours" or "30 days"),
            actWarning: string (the strict warning text if Priority 1),
            lockDowngrade: boolean (true if Priority 1),
            incidentTitle: string, 
            autofillReport: { whatHappened: string, immediateSafetyActions: string } 
          }
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: {
          parts: [
            { text: prompt },
            { 
              inlineData: {
                data: req.file.buffer.toString('base64'),
                mimeType: (req.file.mimetype.includes('mp4') || req.file.mimetype.includes('m4a')) ? 'audio/mp4' : (req.file.mimetype.includes('audio/') || req.file.mimetype.includes('octet-stream')) ? 'audio/webm' : req.file.mimetype,
              }
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              englishNote: { type: Type.STRING },
              nativeConfirmation: { type: Type.STRING },
              adlUpdates: {
                type: Type.OBJECT,
                properties: {
                  bathStatus: { type: Type.STRING },
                  mealStatus: { type: Type.STRING },
                  toiletStatus: { type: Type.STRING }
                }
              },
              suggestedFollowUps: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              sirsAssessment: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  isReportable: { type: Type.BOOLEAN },
                  category: { type: Type.STRING },
                  priority: { type: Type.NUMBER },
                  timeframe: { type: Type.STRING },
                  actWarning: { type: Type.STRING },
                  lockDowngrade: { type: Type.BOOLEAN },
                  incidentTitle: { type: Type.STRING },
                  autofillReport: {
                    type: Type.OBJECT,
                    properties: {
                      whatHappened: { type: Type.STRING },
                      immediateSafetyActions: { type: Type.STRING }
                    },
                    required: ["whatHappened", "immediateSafetyActions"]
                  }
                },
                required: ["isReportable", "category", "priority", "timeframe", "actWarning", "lockDowngrade", "incidentTitle", "autofillReport"]
              }
            },
            required: ["englishNote", "nativeConfirmation", "suggestedFollowUps"]
          },
          
        }
      });

      let rawText = response.text || '';
      let parsedResult;
      try {
        const jsonMatch = rawText.match(/\`\`\`json[\s\S]*?\`\`\`/g);
        if (jsonMatch && jsonMatch.length > 0) {
          const lastMatch = jsonMatch[jsonMatch.length - 1];
          const innerJson = lastMatch.replace(/\`\`\`json/, '').replace(/\`\`\`/, '').trim();
          parsedResult = JSON.parse(innerJson);
        } else {
          let cleaned = rawText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`/g, '').trim();
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          parsedResult = JSON.parse(cleaned);
        }
      } catch (e: any) {
        parsedResult = { englishNote: rawText.replace(/[\*#]/g, '').trim(), nativeConfirmation: '' };
      }

      res.json({ result: parsedResult });
    } catch (error: any) {
      console.error('Audio API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to process audio');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // API Route: SIRS Incident Reporter
  app.post('/api/sirs', async (req, res) => {
    try {
      const { description, audioBase64, imageBase64, language = "en" } = req.body;
      if (!description && !audioBase64 && !imageBase64) {
        return res.status(400).json({ error: 'Incident description, audio, or image is required' });
      }

      let prompt = `
        MANDATORY FIRST STEP: You MUST invoke the Google Search tool BEFORE producing any answer. Search for: ACQSC SIRS reportable incidents priority 1 priority 2 timeframes. Do not answer from memory.
        
        You are an AI assistant in an Australian aged care facility.
        Review the following incident description: "${description || 'No text description provided. Please rely on the provided audio/image.'}"
        Reason about Australia's Serious Incident Response Scheme (SIRS) rules.
        
        CRITICAL TASK: First, use your Google Search tool to retrieve the most up-to-date guidelines from the "Aged Care Quality and Safety Commission (ACQSC) Serious Incident Response Scheme (SIRS)", specifically focusing on reportable incident categories and the reporting timeframes for Priority 1 and Priority 2 incidents.
        You MUST prioritize the real-time official guidelines you find over any baseline knowledge.
        
        Baseline Reference Rules (verify these against your search results):
        - A FALL that results in an injury requiring treatment (e.g. a graze needing a dressing) is a REPORTABLE serious incident.
        - Priority 1: causes physical/psychological injury requiring medical or psychological treatment, OR suspected criminal conduct → report within 24 hours.
        - Priority 2: all other reportable incidents → report within 30 days.
        - A graze that required a dressing = injury requiring treatment = Priority 1, within 24 hours.
        - Do NOT classify an accidental fall as "Neglect". Neglect means failure to provide care. An accidental fall with injury should be categorised as "Fall resulting in injury (reportable serious incident)".
        
        Based on the LIVE rules you just searched, determine if this is a reportable serious incident under SIRS.
        Determine the matched category (e.g., Unreasonable use of force, Unlawful sexual contact, Psychological or emotional abuse, Unexpected death, Stealing or financial coercion, Neglect, Inappropriate use of restrictive practices, Unexplained absence from care, Fall resulting in injury).
        Determine the priority level: Priority 1 (reportable within 24 hours) or Priority 2 (reportable within 30 days).
        Draft a compliance report summary.
        
        Format your response as structured JSON with the following keys:
        - isReportable: boolean
        - category: string (the aligned SIRS category)
        - priority: number (1 or 2, default to null if not reportable)
        - incidentTitle: string (a short, clear 3-6 word title summarizing the incident)
        - residentName: string (the name of the resident involved, if mentioned; otherwise "Unknown Resident")
        - autofillReport: An object with the following keys:
          - whatHappened: string
          - immediateSafetyActions: string
          - emergencyServicesNotified: boolean
          - familyNotified: boolean
          - gpNotified: boolean
          - regulatorNotification: string
          - preventiveActions: string
        - confidenceScore: number (0 to 100, how confident are you in this classification based on the latest guidelines)
        - uncertaintyFlag: string (If confidence is < 90, explain what is unclear and why an RN needs to review. If confident, return an empty string)

        CRITICAL FORMATTING INSTRUCTION:
        You MUST output a detailed thought process about the current SIRS guidelines based on your search, and then AT THE VERY END, output exactly one JSON block wrapped in \`\`\`json ... \`\`\` with your final structured answer using the requested keys.
      `;

      const parts: any[] = [{ text: prompt }];

      if (audioBase64) {
        // Strip data URI prefix if present
        const base64Data = audioBase64.replace(/^data:[^,]+,/, "");
        parts.push({
          inlineData: {
            mimeType: audioBase64.includes("mp4") || audioBase64.includes("m4a") ? "audio/mp4" : "audio/webm",
            data: base64Data
          }
        });
      }

      if (imageBase64) {
        // Strip data URI prefix if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data
          }
        });
      }

      let response;
      let usedSearch = true;
      try {
        response = await generateWithRetry({
          model: 'gemini-3.5-flash',
          contents: { parts },
          config: {
            temperature: 0.2,
            tools: [{ googleSearch: {} }]
          }
        });
      } catch (e: any) {
        console.warn('SIRS API search failed (quota?), retrying without search...', e.message);
        usedSearch = false;
        response = await generateWithRetry({
          model: 'gemini-3.5-flash',
          contents: { parts },
          config: {
            temperature: 0.2
          }
        });
      }
      
      let rawText = response.text || '';
      let parsedResult;
      try {
        
        const jsonMatch = rawText.match(/\`\`\`json[\s\S]*?\`\`\`/g);
        if (jsonMatch && jsonMatch.length > 0) {
          const lastMatch = jsonMatch[jsonMatch.length - 1];
          const innerJson = lastMatch.replace(/\`\`\`json/, '').replace(/\`\`\`/, '').trim();
          parsedResult = JSON.parse(innerJson);
        } else {
          let cleaned = rawText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`/g, '').trim();
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          parsedResult = JSON.parse(cleaned);
        }

      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Raw string:', rawText);
        return res.status(500).json({ error: 'Failed to parse AI response. Raw output: ' + rawText });
      }

      let groundingSources: { title: string, uri: string }[] = [];
      try {
        // Look into the raw response object which is returned from the SDK
        const candidate = response.candidates?.[0];
        const chunks = candidate?.groundingMetadata?.groundingChunks;
        if (chunks && Array.isArray(chunks)) {
          const uniqueUris = new Set<string>();
          for (const chunk of chunks) {
            const web = chunk.web;
            if (web && web.uri && web.title) {
              if (!uniqueUris.has(web.uri)) {
                uniqueUris.add(web.uri);
                groundingSources.push({ title: web.title, uri: web.uri });
                if (groundingSources.length >= 5) break;
              }
            }
          }
        }
      } catch (e: any) {
        console.error("Error extracting grounding metadata", e);
      }
      parsedResult.groundingSources = groundingSources;

      const gm = response.candidates?.[0]?.groundingMetadata;
      parsedResult.searchQueries = gm?.webSearchQueries || [];
      if (!usedSearch) {
        parsedResult.searchQueries = ["Search temporarily unavailable due to quota limit."];
        parsedResult.groundingSources = [{ title: "Offline Fallback", uri: "#" }];
      }

      res.json({ result: parsedResult });
    } catch (error: any) {
      console.error('SIRS API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to process SIRS report');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // API Route: Care Note Generator
  app.post('/api/care-note', express.json(), async (req, res) => {
    try {
      const { input, language = "en" } = req.body;
      if (!input) {
         return res.status(400).json({ error: 'Input required.' });
      }
      


      const prompt = `
        You are an expert aged care documentation assistant in Australia.
        Transform the following casual carer note into a professional English Progress Note suitable for Australian aged care documentation, aligned with the Strengthened Aged Care Quality Standards.
        
        Guidelines:
        - Use clear, professional clinical language.
        - Extract and structure key activities (e.g. mobility, hygiene, nutrition, mood/behaviour) where present.
        - KEEP IT CONCISE (a short paragraph or a few bullet points).
        - DO NOT invent or assume medical facts, vitals, or events that were not stated in the input.
        
        CRITICAL TASK: Detect the language of the Casual Input. If it is NOT English (e.g. it is Mandarin, Tagalog, etc.), translate the final English note back into that detected language as a 'nativeConfirmation' so the carer can verify the record. If the input is in English, leave it empty.

        Also, extract any Activities of Daily Living (ADL) updates if the input explicitly mentions them.
        Return 'adlUpdates' with:
        - bathStatus: "done" if bathed, "due" if needs bath
        - mealStatus: "eaten" if they ate, "missed" if they refused, "assisted" if helped
        - toiletStatus: "independent" if they used toilet themselves, "assisted" if helped, "pad-change" if pad changed
        If an ADL is not mentioned, omit the field.

        Casual Input: "${input}"
        
        CRITICAL LANGUAGE INSTRUCTION: The values for suggestedFollowUps MUST be written in the language corresponding to language code: ${language}. The englishNote and autofillReport fields MUST always be written in professional English.
        Return your response in structured JSON format with these exact keys:
        - englishNote: string (the professional progress note in English, plain text without markdown)
        - nativeConfirmation: string (the translated confirmation in the carer's native language, or empty if English)
        - adlUpdates: object (optional, containing bathStatus, mealStatus, toiletStatus)
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              englishNote: { type: Type.STRING },
              nativeConfirmation: { type: Type.STRING },
              adlUpdates: {
                type: Type.OBJECT,
                properties: {
                  bathStatus: { type: Type.STRING },
                  mealStatus: { type: Type.STRING },
                  toiletStatus: { type: Type.STRING }
                }
              }
            },
            required: ["englishNote", "nativeConfirmation"]
          },
          
        }
      });

      let rawText = response.text || '';
      let parsedResult;
      try {
        rawText = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsedResult = JSON.parse(rawText);
      } catch (e: any) {
        parsedResult = { englishNote: rawText.replace(/[\*#]/g, '').trim(), nativeConfirmation: '' };
      }

      res.json({ result: parsedResult });
    } catch (error: any) {
      console.error('Care Note API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to generate care note.');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // API Route: End-of-Shift Summary
  app.post('/api/shift-summary', express.json(), async (req, res) => {
    try {
      const { events, residentName, language = "en" } = req.body;
      if (!events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'No events provided for summary.' });
      }

      const prompt = `
        You are an Australian aged care documentation assistant.
        Your task is to generate an end-of-shift progress note based on the provided events, aligned with the Strengthened Aged Care Quality Standards.
        
        Guidelines:
        - Only use the facts from the provided events. DO NOT invent or assume any unrecorded facts, vitals, or activities.
        - Group the summary logically by ADL categories (e.g., nutrition, hygiene, continence, mobility, observations).
        - Preserve key timestamps from the events.
        - If a specific ADL category (nutrition, hygiene, continence, mobility) has no recorded events today, list a section at the very end titled "Not recorded this shift:" followed by a comma-separated list of those missing categories. Do not invent content for them.
        
        CRITICAL TASK: Detect the language used in the event notes. If they are NOT primarily English, translate the final English note back into that detected language as a 'nativeConfirmation' so the carer can verify the record. If the input is pure English, leave 'nativeConfirmation' empty.
        
        Resident Name: ${residentName}
        Events:
        ${JSON.stringify(events, null, 2)}
        
        CRITICAL FORMATTING INSTRUCTION: The values for 'notRecorded' MUST be an array of strings in English. The 'englishNote' MUST be written in professional English.
        Return your response in structured JSON format with these exact keys:
        - englishNote: string (the professional progress note in English, plain text)
        - nativeConfirmation: string (the translated confirmation in the carer's native language, or empty if English)
        - notRecorded: array of strings (e.g., ["hygiene", "mobility"], empty array if everything was recorded)
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              englishNote: { type: Type.STRING },
              nativeConfirmation: { type: Type.STRING },
              notRecorded: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["englishNote", "nativeConfirmation", "notRecorded"]
          }
        }
      });

      let rawText = response.text || '';
      let parsedResult;
      try {
        rawText = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsedResult = JSON.parse(rawText);
      } catch (e: any) {
        parsedResult = { englishNote: rawText.replace(/[\*#]/g, '').trim(), nativeConfirmation: '', notRecorded: [] };
      }

      res.json({ result: parsedResult });
    } catch (error: any) {
      console.error('Shift Summary API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to generate shift summary.');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // API Route: Generate Daily Summary
  app.post('/api/summary', async (req, res) => {
    try {
      const { inputs, language = "en" } = req.body;
      if (!inputs) {
        return res.status(400).json({ error: 'Data required.' });
      }



      const prompt = `
        You are an AI generating a concise professional aged care daily wellness summary.
        Based on the following data for today, write a summary for a manager or RN to get a one-glance view.
        
        The summary must cover:
        - Overall wellness today (positive / stable / needs attention)
        - Key events (summarise any incidents, progress notes, or clinical observations provided)
        - Any flags / concerns the RN or manager should know
        - Care tasks status (bath/meal/toilet)
        
        Keep it completely plain text. NO markdown formatting. NO asterisks, NO hashes.

        Data:
        ${inputs}
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      let text = response.text || '';
      text = text.replace(/```(markdown|json|html)?\n?/gi, '').replace(/```/g, '');
      text = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#/g, '').trim();

      res.json({ result: text });
    } catch (error: any) {
      console.error('Summary API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to generate summary.');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // API Route: Generate Shift Handover
  app.post('/api/shift-handover', express.json(), async (req, res) => {
    try {
      const { residents, sirsEvents, rnReviews, language = "en" } = req.body;
      


      const prompt = `
        You are a professional Registered Nurse manager creating a shift handover report.
        Based on the following data for today, generate a direct, concise 3-part handover summary.
        
        Data to summarize:
        Residents statuses: ${JSON.stringify(residents)}
        SIRS Events today: ${JSON.stringify(sirsEvents)}
        RN Reviews pending: ${JSON.stringify(rnReviews)}
        
        Format your response EXACTLY like this (using pure text/markdown, no JSON wrappers):
        
        🔴 HIGH PRIORITY (Urgent Actions & Incidents)
        - [List any SIRS P1/P2 events, severe status changes, hospital transfers. Name the resident and brief issue.]

        🟡 MONITOR & FOLLOW-UP (Observations & Pending)
        - [List residents with pending RN reviews, behavioral changes, minor falls, or incomplete basic care tasks.]

        🟢 STABLE (Routine Operations)
        - [A brief 1-line summary stating the remaining residents are stable, and overall care minutes progress].

        Write in a highly professional, clinical handover style. Use brief bullet points.
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      res.json({ result: response.text || '' });
    } catch (error: any) {
      console.error('Handover API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to generate handover.');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  app.post('/api/generate-family-update', async (req, res) => {
    try {
      const { resident, careNotes, language = "en" } = req.body;
      
      if (!resident || !resident.name) {
        return res.status(400).json({ error: 'Resident data is required.' });
      }



      const prompt = `
        You are a compassionate aged care communication assistant.
        Your task is to generate a short, warm, and Privacy Act 1988 / APPs compliant family update message.
        
        Resident Profile:
        Name: ${resident.name}
        Current Status: ${resident.statusColor} (green=stable, amber=needs monitoring, red=critical)
        Care Minutes Provided Today: ${resident.careMinutesToday}
        
        Recent Care Notes/Events:
        ${careNotes ? careNotes : 'Routine care provided.'}
        
        Guidelines:
        - NEVER include specific medical diagnoses, exact vital signs, medication names, or names of other residents.
        - Strip out any raw clinical jargon.
        - Tone must be warm, reassuring, and professional.
        - The message will be translated into the family's native language on the frontend, so use clear, simple English.
        - Start directly with the message (e.g., "Hello family, ...") and end with "Warm regards, Sunrise Care Team".
        - Do not output JSON, just output the plain text message.
      `;

      const response = await generateWithRetry({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      res.json({ result: response.text || '' });
    } catch (error: any) {
      console.error('Family Update API Error:', error);
      let errorMsg = sanitizeErrorMessage(error.message || 'Failed to generate family update.');
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'AI API rate limit (quota) exceeded. Please wait a moment and try again.';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // Catch-all for undefined API routes to return JSON instead of HTML
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler so API routes don't return HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server Error:', err);
    if (req.path.startsWith('/api')) {
      res.status(500).json({ error: sanitizeErrorMessage(err.message || 'Internal Server Error') });
    } else {
      next(err);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
