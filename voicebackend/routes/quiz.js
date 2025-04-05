const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @route   POST /api/quiz/generate
 * @desc    Generate AI quiz questions based on medications
 * @access  Private
 */
router.post('/generate', async (req, res) => {
  try {
    const { medications } = req.body;
    
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: 'Medications array is required' });
    }

    // Format medications for the prompt
    const medicationsText = medications.map(med => 
      `- ${med.name}: ${med.dosage}, ${med.frequency}`
    ).join('\n');

    // Create the prompt for OpenAI
    const prompt = `
      Create a medication knowledge quiz with 5 multiple-choice questions based on these medications:
      ${medicationsText}
      
      For each medication, create questions about:
      1. Proper dosage
      2. Timing/frequency
      3. What to do if a dose is missed
      4. Potential side effects
      5. Drug interactions
      
      Format the response as a JSON object with this structure:
      {
        "questions": [
          {
            "questionText": "Question text here",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correctAnswer": 0,
            "medicationId": "medication_id_here",
            "explanation": "Brief explanation of the correct answer"
          }
        ]
      }
      
      Make sure the correct answer is not always the first option. Randomize the position of the correct answer.
    `;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a medical quiz generator that creates educational questions about medications." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    // Parse the response
    const responseText = completion.choices[0].message.content;
    let quizData;
    
    try {
      // Try to parse the JSON response
      quizData = JSON.parse(responseText);
    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    res.json(quizData);
  } catch (error) {
    console.error('Error generating quiz questions:', error);
    res.status(500).json({ error: 'Failed to generate quiz questions' });
  }
});

module.exports = router; 