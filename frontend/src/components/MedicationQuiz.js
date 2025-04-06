'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';

export default function MedicationQuiz() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [medications, setMedications] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previousAttempts, setPreviousAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [error, setError] = useState(null);
  const [doctorReport, setDoctorReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    fetchMedications();
    fetchPreviousAttempts();
  }, []);

  const fetchPreviousAttempts = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const q = query(
        collection(db, 'quizAttempts'),
        where('userId', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const attempts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort attempts by date (newest first)
      attempts.sort((a, b) => b.timestamp - a.timestamp);
      setPreviousAttempts(attempts);
    } catch (error) {
      console.error('Error fetching previous attempts:', error);
    }
  };

  const fetchMedications = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const q = query(
        collection(db, 'medications'),
        where('userId', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const meds = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setMedications(meds);
      
      // Generate questions based on medications
      if (meds.length > 0) {
        await generateAIQuestions(meds);
      } else {
        // If no medications, use default questions
        setQuestions(defaultQuestions);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching medications:', error);
      setError('Failed to fetch medications. Please try again later.');
      setQuestions(defaultQuestions);
      setLoading(false);
    }
  };

  const generateAIQuestions = async (meds) => {
    try {
      setLoading(true);
      setError(null);
      
      // Call our backend API to generate AI questions
      const response = await fetch('https://medi-minder-d66fcfda1bec.herokuapp.com/api/quiz/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ medications: meds }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate questions');
      }
      
      const data = await response.json();
      
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        // Fallback to default questions if AI generation fails
        setQuestions(defaultQuestions);
      }
    } catch (error) {
      console.error('Error generating AI questions:', error);
      setError('Failed to generate AI questions. Using default questions instead.');
      setQuestions(defaultQuestions);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to shuffle arrays
  const shuffleArray = (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // Default questions if no medications are found or AI generation fails
  const defaultQuestions = [
    {
      questionText: 'What is the correct dosage of your medication?',
      options: shuffleArray(['1 tablet', '2 tablets', '3 tablets', '4 tablets']),
      correctAnswer: shuffleArray(['1 tablet', '2 tablets', '3 tablets', '4 tablets']).indexOf('1 tablet')
    },
    {
      questionText: 'When should you take your medication?',
      options: shuffleArray(['Before meals', 'After meals', 'With meals', 'Before bed']),
      correctAnswer: shuffleArray(['Before meals', 'After meals', 'With meals', 'Before bed']).indexOf('With meals')
    },
    {
      questionText: 'What should you do if you miss a dose?',
      options: shuffleArray([
        'Take it immediately',
        'Skip it and take the next dose',
        'Double the next dose',
        'Call your doctor'
      ]),
      correctAnswer: shuffleArray([
        'Take it immediately',
        'Skip it and take the next dose',
        'Double the next dose',
        'Call your doctor'
      ]).indexOf('Take it immediately')
    }
  ];

  const handleAnswerClick = (selectedOption) => {
    // Store the user's answer
    const newUserAnswers = [...userAnswers];
    newUserAnswers[currentQuestion] = selectedOption;
    setUserAnswers(newUserAnswers);
    
    if (selectedOption === questions[currentQuestion].correctAnswer) {
      setScore(score + 1);
    }

    const nextQuestion = currentQuestion + 1;
    if (nextQuestion < questions.length) {
      setCurrentQuestion(nextQuestion);
    } else {
      setShowScore(true);
      // Calculate final score before saving
      const finalScore = selectedOption === questions[currentQuestion].correctAnswer ? score + 1 : score;
      saveQuizAttempt(newUserAnswers, finalScore);
    }
  };

  const saveQuizAttempt = async (answers, finalScore) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const attempt = {
        userId: user.uid,
        score: finalScore,
        totalQuestions: questions.length,
        answers: answers,
        questions: questions,
        timestamp: Date.now()
      };

      await addDoc(collection(db, 'quizAttempts'), attempt);
      fetchPreviousAttempts(); // Refresh the list of attempts
    } catch (error) {
      console.error('Error saving quiz attempt:', error);
    }
  };

  const restartQuiz = async () => {
    setCurrentQuestion(0);
    setScore(0);
    setShowScore(false);
    setUserAnswers([]);
    setSelectedAttempt(null);
    
    // Generate a new quiz
    setLoading(true);
    try {
      if (medications.length > 0) {
        await generateAIQuestions(medications);
      } else {
        // If no medications, use default questions with shuffled options
        const newDefaultQuestions = defaultQuestions.map(q => ({
          ...q,
          options: shuffleArray([...q.options]),
          correctAnswer: shuffleArray([...q.options]).indexOf(q.options[q.correctAnswer])
        }));
        setQuestions(newDefaultQuestions);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error generating new quiz:', error);
      setError('Failed to generate new quiz. Please try again later.');
      setLoading(false);
    }
  };

  const viewAttempt = (attempt) => {
    // If clicking on the same attempt, toggle it off
    if (selectedAttempt?.id === attempt.id) {
      setSelectedAttempt(null);
    } else {
      setSelectedAttempt(attempt);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const generateDoctorReport = async () => {
    if (previousAttempts.length === 0) {
      setError("You need to complete at least one quiz to generate a report.");
      return;
    }

    setGeneratingReport(true);
    setError(null);
    
    try {
      // Analyze previous attempts to identify areas of improvement
      const missedQuestions = [];
      const medicationKnowledge = {};
      
      // Process all previous attempts
      previousAttempts.forEach(attempt => {
        attempt.questions.forEach((question, index) => {
          const userAnswer = attempt.answers[index];
          const isCorrect = userAnswer === question.correctAnswer;
          
          if (!isCorrect) {
            // Extract medication name from question if possible
            const medicationMatch = question.questionText.match(/about (.*?)\?/i) || 
                                   question.questionText.match(/for (.*?)\?/i);
            const medicationName = medicationMatch ? medicationMatch[1] : "your medication";
            
            // Track missed questions by medication
            if (!medicationKnowledge[medicationName]) {
              medicationKnowledge[medicationName] = {
                total: 0,
                missed: 0,
                topics: {}
              };
            }
            
            medicationKnowledge[medicationName].total++;
            medicationKnowledge[medicationName].missed++;
            
            // Track specific topics
            const topic = identifyTopic(question.questionText);
            if (!medicationKnowledge[medicationName].topics[topic]) {
              medicationKnowledge[medicationName].topics[topic] = 0;
            }
            medicationKnowledge[medicationName].topics[topic]++;
            
            // Add to missed questions if not already there
            if (!missedQuestions.some(q => q.questionText === question.questionText)) {
              missedQuestions.push({
                ...question,
                medicationName,
                topic
              });
            }
          }
        });
      });
      
      // Generate report content
      const reportContent = {
        date: new Date().toLocaleDateString(),
        patientName: auth.currentUser?.email || "Patient",
        overallScore: calculateOverallScore(previousAttempts),
        medicationKnowledge,
        areasForEducation: generateEducationAreas(medicationKnowledge),
        specificQuestions: missedQuestions.slice(0, 5), // Top 5 most missed questions
        recommendations: generateRecommendations(medicationKnowledge)
      };
      
      setDoctorReport(reportContent);
      setShowReport(true); // Show the report after generating it
    } catch (error) {
      console.error('Error generating doctor report:', error);
      setError('Failed to generate doctor report. Please try again later.');
    } finally {
      setGeneratingReport(false);
    }
  };
  
  const identifyTopic = (questionText) => {
    const lowerText = questionText.toLowerCase();
    if (lowerText.includes('dosage') || lowerText.includes('how much') || lowerText.includes('amount')) {
      return 'Dosage';
    } else if (lowerText.includes('when') || lowerText.includes('time') || lowerText.includes('schedule')) {
      return 'Timing';
    } else if (lowerText.includes('miss') || lowerText.includes('skip') || lowerText.includes('forget')) {
      return 'Missed Doses';
    } else if (lowerText.includes('side effect') || lowerText.includes('adverse') || lowerText.includes('reaction')) {
      return 'Side Effects';
    } else if (lowerText.includes('interact') || lowerText.includes('other medication') || lowerText.includes('food')) {
      return 'Interactions';
    } else if (lowerText.includes('store') || lowerText.includes('keep') || lowerText.includes('refrigerate')) {
      return 'Storage';
    } else {
      return 'General Knowledge';
    }
  };
  
  const calculateOverallScore = (attempts) => {
    if (attempts.length === 0) return 0;
    
    const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const totalQuestions = attempts.reduce((sum, attempt) => sum + attempt.totalQuestions, 0);
    
    return totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;
  };
  
  const generateEducationAreas = (knowledge) => {
    const areas = [];
    
    Object.entries(knowledge).forEach(([medication, data]) => {
      if (data.total > 0) {
        const missRate = (data.missed / data.total) * 100;
        
        if (missRate > 50) {
          areas.push({
            medication,
            level: 'High Priority',
            description: `Significant knowledge gaps about ${medication}. Consider scheduling a detailed consultation.`
          });
        } else if (missRate > 25) {
          areas.push({
            medication,
            level: 'Medium Priority',
            description: `Some knowledge gaps about ${medication}. Review medication information and ask questions at next appointment.`
          });
        } else {
          areas.push({
            medication,
            level: 'Low Priority',
            description: `Good understanding of ${medication}, but some areas could be reviewed.`
          });
        }
      }
    });
    
    return areas;
  };
  
  const generateRecommendations = (knowledge) => {
    const recommendations = [];
    
    // Add general recommendations
    recommendations.push({
      title: 'Schedule a Medication Review',
      description: 'Schedule an appointment with your healthcare provider to review all your medications.'
    });
    
    // Add medication-specific recommendations
    Object.entries(knowledge).forEach(([medication, data]) => {
      if (data.total > 0) {
        const missRate = (data.missed / data.total) * 100;
        
        if (missRate > 50) {
          recommendations.push({
            title: `Detailed Education on ${medication}`,
            description: `Request a detailed explanation about ${medication}, including proper usage, side effects, and interactions.`
          });
        }
        
        // Add topic-specific recommendations
        Object.entries(data.topics).forEach(([topic, count]) => {
          if (count > 0) {
            recommendations.push({
              title: `Review ${topic} for ${medication}`,
              description: `Focus on understanding ${topic.toLowerCase()} aspects of ${medication}.`
            });
          }
        });
      }
    });
    
    return recommendations;
  };
  
  const downloadReport = () => {
    if (!doctorReport) return;
    
    // Import the jsPDF library dynamically
    import('jspdf').then(({ default: jsPDF }) => {
      // Create a new PDF document
      const doc = new jsPDF();
      
      // Set font styles
      doc.setFont('helvetica', 'bold');
      
      // Add header with logo
      doc.setFontSize(24);
      doc.setTextColor(41, 128, 185); // Blue color
      doc.text('Medication Knowledge Report', 20, 20);
      
      // Add date and patient info
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100); // Gray color
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${doctorReport.date}`, 20, 30);
      doc.text(`Patient: ${doctorReport.patientName}`, 20, 37);
      
      // Add overall score with visual bar
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('Overall Medication Knowledge', 20, 50);
      
      // Draw score bar
      // Draw background (gray) bar first
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(240, 240, 240);
      doc.rect(20, 55, 170, 10, 'F');
      
      // Draw the filled (blue) portion based on score
      doc.setFillColor(41, 128, 185);
      const scoreWidth = (doctorReport.overallScore / 100) * 170;
      doc.rect(20, 55, scoreWidth, 10, 'F');
      
      // Draw border
      doc.setDrawColor(200, 200, 200);
      doc.rect(20, 55, 170, 10);
      
      
      // Add areas for education
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('Areas for Education', 20, 80);
      
      let yPos = 90;
      doctorReport.areasForEducation.forEach((area, index) => {
        // Check if we need a new page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        // Add colored dot based on priority
        doc.setFillColor(
          area.level === 'High Priority' ? 231 : 
          area.level === 'Medium Priority' ? 241 : 46,
          area.level === 'High Priority' ? 76 : 
          area.level === 'Medium Priority' ? 196 : 204,
          area.level === 'High Priority' ? 60 : 
          area.level === 'Medium Priority' ? 15 : 113
        );
        doc.circle(25, yPos + 3, 2, 'F');
        
        // Add medication name and level
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(41, 128, 185);
        doc.text(`${area.medication} (${area.level})`, 35, yPos + 5);
        
        // Add description
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        
        // Split description into multiple lines if needed
        const splitDescription = doc.splitTextToSize(area.description, 170);
        doc.text(splitDescription, 35, yPos + 15);
        
        // Update y position for next item
        yPos += 25 + (splitDescription.length - 1) * 7;
      });
      
      // Add recommendations
      yPos += 10;
      
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('Recommendations', 20, yPos);
      
      yPos += 15;
      
      doctorReport.recommendations.forEach((rec, index) => {
        // Check if we need a new page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        // Add bullet point
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(41, 128, 185);
        doc.text('•', 20, yPos + 5);
        
        // Add recommendation title
        doc.text(rec.title, 30, yPos + 5);
        
        // Add description
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        
        // Split description into multiple lines if needed
        const splitDescription = doc.splitTextToSize(rec.description, 170);
        doc.text(splitDescription, 30, yPos + 15);
        
        // Update y position for next item
        yPos += 20 + (splitDescription.length - 1) * 7;
      });
      
      // Add specific questions to discuss
      yPos += 10;
      
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('Specific Questions to Discuss', 20, yPos);
      
      yPos += 15;
      
      doctorReport.specificQuestions.forEach((q, i) => {
        // Check if we need a new page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        // Add question number and text
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(41, 128, 185);
        doc.text(`${i+1}. ${q.questionText}`, 20, yPos + 5);
        
        // Add topic
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(`Topic: ${q.topic}`, 20, yPos + 15);
        
        // Update y position for next item
        yPos += 30;
      });
      
      // Add footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
        doc.text('Generated by MediMinder', 105, 295, { align: 'center' });
      }
      
      // Save the PDF
      doc.save(`MedicationKnowledgeReport_${new Date().toISOString().split('T')[0]}.pdf`);
    }).catch(error => {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again later.');
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <p className="text-lg text-gray-700">Loading your personalized medication quiz...</p>
        <p className="text-sm text-gray-500 mt-2">This may take a moment as we generate AI questions based on your medications.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-8">
          Medication Knowledge Quiz
        </h1>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
          <p>{error}</p>
        </div>
        <button
          onClick={() => fetchMedications()}
          className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-8">
          Medication Knowledge Quiz
        </h1>
        <p className="text-lg text-gray-700 mb-6">
          You haven't added any medications yet. Add your medications in the dashboard to take a personalized quiz.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h1 className="text-3xl font-bold text-center text-gray-900 mb-8">
        Medication Knowledge Quiz
      </h1>
      
      {showScore ? (
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Quiz Complete!
          </h2>
          <p className="text-xl text-gray-700 mb-6">
            You scored {score} out of {questions.length}
          </p>
          <button
            onClick={restartQuiz}
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Take Quiz Again
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Question {currentQuestion + 1} of {questions.length}
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              {questions[currentQuestion].questionText}
            </p>
          </div>
          
          <div className="space-y-4">
            {questions[currentQuestion].options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerClick(index)}
                className="w-full text-left p-4 rounded-lg border text-gray-900 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Previous Attempts Section */}
      {previousAttempts.length > 0 && (
        <div className="mt-12 border-t pt-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-900">
              Previous Quiz Attempts
            </h2>
            <div className="flex space-x-2">
              {doctorReport && (
                <button
                  onClick={() => setShowReport(!showReport)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  {showReport ? 'Hide Report' : 'Show Report'}
                </button>
              )}
              <button
                onClick={generateDoctorReport}
                disabled={generatingReport}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center"
              >
                {generatingReport ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate Doctor Report'
                )}
              </button>
            </div>
          </div>
          
          {/* Doctor Report Section */}
          {doctorReport && showReport && (
            <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  Medication Knowledge Report
                </h3>
                <button
                  onClick={() => setShowReport(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <p className="text-gray-700 mb-4">
                This report highlights areas where you may need additional education about your medications.
                Share this with your healthcare provider at your next appointment.
              </p>
              
              <div className="mb-4">
                <h4 className="font-medium text-gray-900">Overall Knowledge Score: {doctorReport.overallScore}%</h4>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${doctorReport.overallScore}%` }}></div>
                </div>
              </div>
              
              <div className="mb-4">
                <h4 className="font-medium text-gray-900 mb-2">Areas for Education:</h4>
                <ul className="space-y-2 text-gray-900 ">
                  {doctorReport.areasForEducation.map((area, index) => (
                    <li key={index} className="flex items-start">
                      <span className={`inline-block w-3 h-3 rounded-full mr-2 mt-1 ${
                        area.level === 'High Priority' ? 'bg-red-500' : 
                        area.level === 'Medium Priority' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}></span>
                      <div>
                        <span className="font-medium">{area.medication}</span>
                        <p className="text-sm text-gray-600">{area.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={downloadReport}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Download Report
                </button>
              </div>
            </div>
          )}
          
          <div className="space-y-6 text-gray-900">
            {previousAttempts.map((attempt) => (
              <div 
                key={attempt.id} 
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedAttempt?.id === attempt.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-300'
                }`}
                onClick={() => viewAttempt(attempt)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      Score: {attempt.score} out of {attempt.totalQuestions}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDate(attempt.timestamp)}
                    </p>
                  </div>
                  <button 
                    className="text-blue-600 hover:text-blue-800"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent the parent click event
                      viewAttempt(attempt);
                    }}
                  >
                    {selectedAttempt?.id === attempt.id ? 'Hide Details' : 'View Details'}
                  </button>
                </div>
                
                {/* Show detailed results when selected */}
                {selectedAttempt?.id === attempt.id && (
                  <div className="mt-4 space-y-4">
                    {attempt.questions.map((question, qIndex) => {
                      const userAnswer = attempt.answers[qIndex];
                      const isCorrect = userAnswer === question.correctAnswer;
                      
                      return (
                        <div key={qIndex} className="border-t pt-4">
                          <p className="font-medium mb-2">{question.questionText}</p>
                          <div className="space-y-2">
                            {question.options.map((option, oIndex) => (
                              <div 
                                key={oIndex} 
                                className={`p-2 rounded ${
                                  oIndex === question.correctAnswer 
                                    ? 'bg-green-100 border border-green-300' 
                                    : oIndex === userAnswer && !isCorrect
                                      ? 'bg-red-100 border border-red-300'
                                      : ''
                                }`}
                              >
                                {option}
                                {oIndex === question.correctAnswer && (
                                  <span className="ml-2 text-green-600">✓ Correct</span>
                                )}
                                {oIndex === userAnswer && !isCorrect && (
                                  <span className="ml-2 text-red-600">✗ Your answer</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {question.explanation && (
                            <p className="mt-2 text-sm text-gray-600 italic">
                              {question.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 