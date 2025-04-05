'use client';

import { useState, useEffect, useRef } from 'react';

export default function JournalAnalyzer({ entry, onAnalysisComplete }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [aiResponse, setAiResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [nurseName, setNurseName] = useState('Sarah');
  const audioRef = useRef(null);

  useEffect(() => {
    // Initialize audio element for GPT voice
    audioRef.current = new Audio();
    
    // Generate a random nurse name if not already set
    if (!nurseName) {
      const names = ['Sarah', 'Emily', 'Jennifer', 'Michelle', 'Lisa', 'Rachel', 'Jessica', 'Amanda'];
      setNurseName(names[Math.floor(Math.random() * names.length)]);
    }
    
    return () => {
      // Clean up
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [nurseName]);

  const speakWithGPTVoice = async (text) => {
    try {
      setIsSpeaking(true);
      setError(null);
      
      console.log('Speaking with GPT voice:', text);
      
      // Call the backend API to process the voice
      const response = await fetch('/api/process-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          nurseName,
          personalized: true
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend error response:', errorData);
        throw new Error(errorData.error || 'Failed to process voice with backend');
      }
      
      const data = await response.json();
      console.log('Response from backend:', data);
      
      // Update the UI to show the response
      if (data.response) {
        setAiResponse(data.response);
        
        // Play the audio from the backend if available
        if (data.audioUrl) {
          try {
            // Create a new audio element
            const audio = new Audio(`http://localhost:3001${data.audioUrl}`);
            
            audio.onended = () => {
              setIsSpeaking(false);
            };
            
            audio.onerror = (error) => {
              console.error('Audio playback error:', error);
              setIsSpeaking(false);
              setError('Failed to play AI response audio. Please try again.');
              
              // Fallback to browser speech synthesis
              fallbackToSpeechSynthesis(data.response);
            };
            
            // Play the audio
            audio.play().catch(error => {
              console.error('Error playing audio:', error);
              setIsSpeaking(false);
              setError('Failed to play AI response audio. Please try again.');
              
              // Fallback to browser speech synthesis
              fallbackToSpeechSynthesis(data.response);
            });
          } catch (error) {
            console.error('Error setting up audio playback:', error);
            setIsSpeaking(false);
            
            // Fallback to browser speech synthesis
            fallbackToSpeechSynthesis(data.response);
          }
        } else {
          // If no audio URL is provided, use browser speech synthesis
          fallbackToSpeechSynthesis(data.response);
        }
      } else {
        // If no response text is provided, use the text directly
        setAiResponse(text);
        fallbackToSpeechSynthesis(text);
      }
      
      // If the backend provides analysis data, pass it to the parent component
      if (data.analysis) {
        onAnalysisComplete(data.analysis);
      }
      
      return data;
    } catch (error) {
      console.error('Error speaking with GPT voice:', error);
      setIsSpeaking(false);
      setError(error.message || 'Failed to play AI response. Please try again.');
      
      // Fallback to browser speech synthesis if backend fails
      const fallbackResponse = `Hello, I'm ${nurseName}, your AI nurse assistant. I'm having trouble connecting to my advanced processing system right now. I can still help you with basic information. You mentioned: ${text}. Please try again later for a more detailed analysis.`;
      
      setAiResponse(fallbackResponse);
      fallbackToSpeechSynthesis(fallbackResponse);
      
      return null;
    }
  };
  
  // Helper function for fallback speech synthesis
  const fallbackToSpeechSynthesis = (text) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Try to use a female voice if available
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.includes('female') || 
        voice.name.includes('Female') || 
        voice.name.includes('Samantha') || 
        voice.name.includes('Google US English Female')
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      // Adjust speech parameters for a more natural nurse-like voice
      utterance.rate = 0.9; // Slightly slower than default
      utterance.pitch = 1.1; // Slightly higher pitch
      
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      // If speech synthesis is not available, just show the text
      setIsSpeaking(false);
    }
  };

  const analyzeEntry = async () => {
    if (!entry.trim()) return;
    
    setAnalyzing(true);
    setError(null);
    setAiResponse('');
    
    try {
      // Process the entry through the backend
      const result = await speakWithGPTVoice(entry);
      
      if (result && result.analysis) {
        onAnalysisComplete(result.analysis);
      }
      
      return true;
    } catch (error) {
      console.error('Error analyzing journal entry:', error);
      setError('Failed to analyze your entry. Please try again.');
      return false;
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center mb-2">
        <div className="bg-blue-100 p-2 rounded-full mr-3">
          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-800">Your AI Nurse: {nurseName}</h3>
          <p className="text-xs text-gray-500">Click "Analyze Entry" to get personalized health advice</p>
        </div>
      </div>
      
      <button
        onClick={analyzeEntry}
        disabled={analyzing || !entry.trim()}
        className={`w-full px-4 py-2 rounded-md font-medium text-base ${
          analyzing || !entry.trim()
            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {analyzing ? 'Analyzing...' : 'Analyze Entry'}
      </button>
      
      {aiResponse && (
        <div className="bg-blue-50 p-4 rounded-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-800">{aiResponse}</p>
              {isSpeaking && (
                <p className="text-xs text-blue-600 mt-1">Nurse {nurseName} is speaking...</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 