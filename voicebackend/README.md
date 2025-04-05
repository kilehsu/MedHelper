# MediMinder Voice Backend

This service handles voice processing for the MediMinder application, providing a complete workflow for voice interaction:
1. Record user's voice from mic
2. Convert speech to text using OpenAI Whisper
3. Process text with ChatGPT
4. Convert response to speech using OpenAI TTS
5. Return audio response to user

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your OpenAI API key:
```
PORT=3001
OPENAI_API_KEY=your_openai_api_key_here
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### POST /process-voice
Processes voice input and returns text and audio response.

**Request:**
- Content-Type: multipart/form-data
- Body: audio file in 'audio' field

**Response:**
```json
{
  "text": "The transcribed and processed text response",
  "audioUrl": "/audio/filename.mp3"
}
```

### GET /audio/:filename
Serves the generated audio response files.

## Usage Example

```javascript
// Frontend example using fetch
const formData = new FormData();
formData.append('audio', audioBlob);

const response = await fetch('http://localhost:3001/process-voice', {
  method: 'POST',
  body: formData
});

const data = await response.json();
// data.text contains the response text
// data.audioUrl contains the URL to play the audio response
``` 