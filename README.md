# Aged Care Compliance Copilot

An AI-powered application designed to support caregivers and registered nurses (RNs) in Australian aged care facilities. It bridges the gap between casual, multilingual carer inputs and strict Australian clinical documentation standards, specifically aligning with the Serious Incident Response Scheme (SIRS) and the Strengthened Aged Care Quality Standards.

## Core Value Proposition

- **Multilingual Support for Carers**: Allows carers from diverse linguistic backgrounds to input observations casually via text or speech.
- **Automated Clinical Transformation**: Converts casual observations into professional, objective English clinical progress notes.
- **SIRS Compliance**: Analyzes incident reports against ACQSC guidelines to automatically determine SIRS reportability and priority, drafting compliance-ready regulator notifications.
- **Clinical Triage**: Automatically flags potential risks (e.g., pressure injuries, critical symptoms) based on visual AI analysis of wound images.

## Features & Implementation Layers

To clarify what is fully functional, what is mock UI, and what is planned for the future, this project is structured into three distinct layers:

### 1. 【AI Fully Implemented】 (Live Gemini Endpoints)
The backend leverages `gemini-2.5-flash` to process real-time multimodal inputs:
- **Image Triage API (`/api/vision`)**: Analyzes wound/injury photos to determine type, severity, and potential risks, suggesting temporary care plans based on Australian guidelines.
- **SIRS Classification API (`/api/sirs`)**: Uses **Google Search Tool Grounding** to look up current ACQSC guidelines and reason about incident priority (Priority 1 vs 2), generating regulator-ready drafts.
- **Speech Translation API (`/api/audio-note`)**: Processes raw WebM audio recordings from carers in *any language* (Mandarin, Tagalog, etc.) and outputs a structured English clinical note.
- **Cross-Lingual Note API (`/api/care-note`)**: Transforms typed casual notes into professional clinical notes while providing a `nativeConfirmation` (a translation of the final note back into the carer's original language to ensure accuracy).

### 2. 【UI Fully Implemented】 (Frontend Components)
The React/Vite frontend provides a polished interface for:
- **Role-Based Access**: Distinct views for Caregivers vs. Registered Nurses.
- **Dashboard & Shift View**: Real-time overview of resident status, care minutes, and pending RN reviews.
- **Interactive Body Diagram**: Visually map injuries or observations.
- **Red Line Lockdown (Demo Feature)**: If a manager attempts to downgrade an AI-classified Priority 1 SIRS incident below the mandated threshold, the system displays an "Aged Care Act Breach" warning and locks the submission, illustrating compliance guardrails.

### 3. 【Phase 2 Planning】 (Future Roadmap)
- Deeper integration with legacy EHR systems (e.g., AutumnCare, LeeCare).
- Real-time biometric IoT integrations (e.g., automated fall detection alerts, vital sign monitoring).
- Extended native language training modules for staff.

## Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Express.js (Node.js), `@google/genai` SDK
- **Database**: Firebase Firestore (for simulated real-time data syncing and note persistence)

## Data Governance & Privacy
- This application processes simulated, non-identifiable patient data. 
- In a production environment, AI processing would require explicit consent frameworks compliant with the Australian Privacy Principles (APPs).
- Currently, Gemini API calls do *not* use data for model training if configured via enterprise endpoints, ensuring organizational data security.

## Setup & Running

1. Install dependencies: \`npm install\`
2. Set environment variables: Add \`GEMINI_API_KEY\` to a \`.env\` file.
3. Start the application: \`npm run dev\`

(The application runs full-stack with a Vite middleware over an Express server on port 3000).
