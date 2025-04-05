require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

// Import routes
const quizRoutes = require('./routes/quiz');

const app = express();

// Configure multer to append .webm extension
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Append .webm extension to the file
    cb(null, file.fieldname + '-' + Date.now() + '.webm');
  }
});

const upload = multer({ storage: storage });

// Configure multer for image uploads
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Append appropriate extension based on file type
    const ext = path.extname(file.originalname);
    cb(null, 'image-' + Date.now() + ext);
  }
});

const imageUpload = multer({ 
  storage: imageStorage,
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Endpoint to handle voice recording
app.post('/process-voice', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('Received audio file:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    // 1. Convert audio to text using Whisper
    const audioFile = fs.createReadStream(req.file.path);
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    // 2. Send text to ChatGPT
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful medical assistant. Keep your responses concise and clear."
        },
        {
          role: "user",
          content: transcription.text
        }
      ],
    });

    const responseText = chatCompletion.choices[0].message.content;

    // 3. Convert response to speech
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: responseText,
    });

    // Save the audio file
    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const audioFileName = `response-${Date.now()}.mp3`;
    const audioPath = path.join('uploads', audioFileName);
    fs.writeFileSync(audioPath, audioBuffer);

    // Clean up the uploaded audio file
    fs.unlinkSync(req.file.path);

    // Return the response audio file path
    res.json({
      text: responseText,
      audioUrl: `/audio/${audioFileName}`
    });

  } catch (error) {
    console.error('Error processing voice:', error);
    res.status(500).json({ error: 'Error processing voice request' });
  }
});

// Endpoint to handle medicine image recognition
app.post('/recognize-medicine', imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('Received image file:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    // Convert image to base64
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Use OpenAI's vision model to analyze the medicine
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a medical assistant specialized in identifying medicines. Analyze the image and provide information about the medicine in the following EXACT format:\n\nMedication Name: [name]\nDosage: [dosage]\nFrequency: [frequency]\nNotes: [Additional important information, warnings, or special instructions]\n\nBe concise and accurate. If you cannot identify the medicine or any field with high confidence, respond with 'Error: [specific reason why identification failed]'"
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Please identify this medicine and provide the information in the specified format." 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const medicineInfo = response.choices[0].message.content;

    // Check if the response indicates an error
    if (medicineInfo.startsWith('Error:')) {
      return res.status(400).json({ 
        error: medicineInfo.substring(7).trim() 
      });
    }

    // Clean up the uploaded image file
    fs.unlinkSync(req.file.path);

    // Return the medicine information
    res.json({
      medicineInfo: medicineInfo
    });

  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: 'Error processing image request' });
  }
});

// Add endpoint for text-to-speech processing
app.post('/process-medication', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // Get ChatGPT to enhance the message
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful medical assistant. Keep your responses concise, clear, and focused on medication information. Make sure to maintain a friendly and professional tone."
        },
        {
          role: "user",
          content: text
        }
      ],
    });

    const enhancedText = chatCompletion.choices[0].message.content;

    // Convert the enhanced text to speech
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: enhancedText,
    });

    // Save the audio file
    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const audioFileName = `response-${Date.now()}.mp3`;
    const audioPath = path.join('uploads', audioFileName);
    fs.writeFileSync(audioPath, audioBuffer);

    // Return the response
    res.json({
      text: enhancedText,
      audioUrl: `/audio/${audioFileName}`
    });

  } catch (error) {
    console.error('Error processing text-to-speech:', error);
    res.status(500).json({ error: 'Error processing text-to-speech request' });
  }
});

// Add endpoint for medication text-to-speech
app.post('/speak-medication', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // Get ChatGPT to enhance the message
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful medical assistant. Keep your responses concise, clear, and focused on medication information. Make sure to maintain a friendly and professional tone."
        },
        {
          role: "user",
          content: text
        }
      ],
    });

    const enhancedText = chatCompletion.choices[0].message.content;

    // Convert the enhanced text to speech
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: enhancedText,
    });

    // Save the audio file
    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const audioFileName = `medication-${Date.now()}.mp3`;
    const audioPath = path.join('uploads', audioFileName);
    fs.writeFileSync(audioPath, audioBuffer);

    // Return the response
    res.json({
      text: enhancedText,
      audioUrl: `/audio/${audioFileName}`
    });

  } catch (error) {
    console.error('Error processing text-to-speech:', error);
    res.status(500).json({ error: 'Error processing text-to-speech request' });
  }
});

// Add endpoint for text-based AI nurse responses
app.post('/process-voice', express.json(), async (req, res) => {
  try {
    const { text, nurseName, personalized } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    console.log('Received text for AI nurse:', { text, nurseName, personalized });

    // Get ChatGPT to generate a personalized nurse response
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are ${nurseName || 'Sarah'}, a friendly and knowledgeable AI nurse assistant. 
          Provide personalized medical advice based on the user's journal entry. 
          Be empathetic, professional, and concise. 
          If the user mentions specific symptoms, medications, or concerns, address them directly.
          End your response with a follow-up question to encourage continued dialogue.`
        },
        {
          role: "user",
          content: text
        }
      ],
    });

    const responseText = chatCompletion.choices[0].message.content;

    // Convert the response to speech
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: responseText,
    });

    // Save the audio file
    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const audioFileName = `nurse-response-${Date.now()}.mp3`;
    const audioPath = path.join('uploads', audioFileName);
    fs.writeFileSync(audioPath, audioBuffer);

    // Return the response
    res.json({
      response: responseText,
      audioUrl: `/audio/${audioFileName}`
    });

  } catch (error) {
    console.error('Error processing AI nurse response:', error);
    res.status(500).json({ error: 'Error processing AI nurse response' });
  }
});

// Serve audio files
app.get('/audio/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(filePath);
});

// Routes
app.use('/api/quiz', quizRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Voice backend server running on port ${PORT}`);
}); 