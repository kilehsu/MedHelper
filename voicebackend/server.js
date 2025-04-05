require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

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
          content: "You are a medical assistant specialized in identifying medicines. Analyze the image and provide information about the medicine, including its name, purpose, and any warnings. Be concise and accurate."
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "What medicine is this? Please identify it and provide key information." 
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

// Serve audio files
app.get('/audio/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(filePath);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Voice backend server running on port ${PORT}`);
}); 