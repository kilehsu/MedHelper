'use client';

import { useState, useRef } from 'react';

export default function VoiceTest() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);

  const startRecording = async () => {
    try {
      setError('');
      setDebugInfo('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use the browser's default format (usually WebM)
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToServer(audioBlob);
      };

      // Start recording with 1-second timeslices for better handling
      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setDebugInfo('Recording started with WebM format');
    } catch (err) {
      setError('Error accessing microphone: ' + err.message);
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const sendAudioToServer = async (audioBlob) => {
    try {
      setIsProcessing(true);
      setError('');
      
      // Debug information about the audio blob
      const debugText = `
        Audio Format: ${audioBlob.type}
        Size: ${(audioBlob.size / 1024).toFixed(2)} KB
        MIME Type: ${audioBlob.type}
      `;
      setDebugInfo(debugText);
      console.log('Audio Blob Info:', debugText);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('https://medi-minder-d66fcfda1bec.herokuapp.com/process-voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();
      setResponseText(data.text);
      setAudioUrl(`https://medi-minder-d66fcfda1bec.herokuapp.com${data.audioUrl}`);
      
      // Auto-play the response
      if (audioPlayerRef.current) {
        audioPlayerRef.current.play();
      }
    } catch (err) {
      setError('Error processing audio: ' + err.message);
      console.error('Error processing audio:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6">Voice Test Component</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <div className="mb-6">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-lg font-medium ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          
          {isProcessing && (
            <span className="ml-3 text-gray-600">Processing...</span>
          )}
        </div>
        
        {debugInfo && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Debug Information:</h2>
            <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm whitespace-pre">
              {debugInfo}
            </div>
          </div>
        )}
        
        {responseText && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Response:</h2>
            <div className="bg-gray-100 p-4 rounded-lg">
              {responseText}
            </div>
          </div>
        )}
        
        {audioUrl && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Audio Response:</h2>
            <audio 
              ref={audioPlayerRef}
              src={audioUrl} 
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}