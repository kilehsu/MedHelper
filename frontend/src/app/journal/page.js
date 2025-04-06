'use client';

import { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function Journal() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [medications, setMedications] = useState([]);
  
  // Form states
  const [journalText, setJournalText] = useState('');
  const [selectedMedication, setSelectedMedication] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [severity, setSeverity] = useState('moderate');
  const [timeAfterDose, setTimeAfterDose] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchEntries(user.uid);
        fetchMedications(user.uid);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchMedications = async (userId) => {
    try {
      const q = query(collection(db, 'medications'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      const meds = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMedications(meds);
    } catch (error) {
      console.error('Error fetching medications:', error);
    }
  };

  const fetchEntries = async (userId) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'journal'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const journalEntries = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEntries(journalEntries);
      setError(null);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      setError('Failed to load your journal entries. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processRecording(audioBlob);
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
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

  const processRecording = async (audioBlob) => {
    try {
      setIsProcessing(true);
      setError('');
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('medication', selectedMedication);
      formData.append('severity', severity);
      formData.append('timeAfterDose', timeAfterDose);
      formData.append('symptoms', symptoms);

      const response = await fetch('http://localhost:3001/process-voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();
      console.log(data);
      
      if (data.text) {
        setJournalText(data.extractedInfo);
        setAudioUrl(`http://localhost:3001${data.audioUrl}`);
        
        // Create a new audio element for the AI response
        const aiAudio = new Audio(`http://localhost:3001${data.audioUrl}`);
        aiAudio.oncanplaythrough = () => {
          aiAudio.play().catch(err => {
            console.error('Error playing AI response:', err);
            setError('Could not play AI response automatically. Please try clicking the play button.');
          });
        };
      }
    } catch (err) {
      setError('Error processing recording: ' + err.message);
      console.error('Error processing recording:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const user = auth.currentUser;
      if (!user) return;

      const entryData = {
        text: journalText,
        userId: user.uid,
        timestamp: new Date().toISOString(),
        medication: selectedMedication,
        symptoms: symptoms.split(',').map(s => s.trim()).filter(s => s),
        severity,
        timeAfterDose: parseInt(timeAfterDose) || null,
        audioUrl: audioUrl || null
      };

      await addDoc(collection(db, 'journal'), entryData);
      
      // Reset form
      setJournalText('');
      setSelectedMedication('');
      setSymptoms('');
      setSeverity('moderate');
      setTimeAfterDose('');
      setAudioUrl('');
      
      // Refresh entries
      fetchEntries(user.uid);
    } catch (err) {
      setError('Error saving journal entry: ' + err.message);
      console.error('Error saving journal entry:', err);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your journal entries...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center mb-6">
            <div className="bg-blue-100 p-3 rounded-full mr-4">
              <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Journal Entry</h1>
              <p className="text-gray-600">Record or type your experiences</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
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

          <div className="mb-6">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`w-full flex items-center justify-center px-6 py-4 rounded-lg text-white font-medium text-lg transition-all duration-200 ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isRecording ? (
                <div className="flex items-center">
                  <span className="animate-pulse text-2xl mr-2">●</span>
                  Recording... Click to Stop
                </div>
              ) : isProcessing ? (
                <div className="flex items-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center">
                  <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Start Recording
                </div>
              )}
            </button>

            {audioUrl && (
              <div className="mt-4">
                <audio 
                  ref={audioPlayerRef}
                  controls 
                  src={audioUrl} 
                  className="w-full"
                />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Journal Entry
              </label>
              <textarea
                value={journalText}
                onChange={(e) => setJournalText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border text-gray-700 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe how you're feeling..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Medication
              </label>
              <select
                value={selectedMedication}
                onChange={(e) => setSelectedMedication(e.target.value)}
                className="w-full px-3 py-2 border text-gray-700 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a medication</option>
                {medications.map(med => (
                  <option key={med.id} value={med.name}>{med.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Symptoms (comma-separated)
              </label>
              <input
                type="text"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="headache, nausea, dizziness"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full px-3 py-2 border text-gray-700 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minutes After Dose
                </label>
                <input
                  type="number"
                  value={timeAfterDose}
                  onChange={(e) => setTimeAfterDose(e.target.value)}
                  className="w-full px-3 py-2 border text-gray-700 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="30"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-green-500 text-white py-3 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-200"
            >
              Save Journal Entry
            </button>
          </form>
        </div>

        <div className="space-y-6">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-900 whitespace-pre-wrap">{entry.text}</p>
                  
                  {entry.medication && (
                    <div className="mt-2">
                      <span className="text-sm font-medium text-gray-500">Medication: </span>
                      <span className="text-sm text-gray-900">{entry.medication}</span>
                      {entry.timeAfterDose && (
                        <span className="text-sm text-gray-500"> ({entry.timeAfterDose} minutes after dose)</span>
                      )}
                    </div>
                  )}
                  
                  {entry.symptoms && entry.symptoms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 ">
                      {entry.symptoms.map((symptom, index) => (
                        <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {symptom}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {entry.severity && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        entry.severity === 'mild' ? 'bg-green-100 text-green-800' :
                        entry.severity === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {entry.severity}
                      </span>
                    </div>
                  )}
                  
                  <p className="text-sm text-gray-500 mt-2">{formatDate(entry.timestamp)}</p>
                </div>
              </div>
              
              {entry.audioUrl && (
                <div className="mt-4">
                  <audio 
                    controls 
                    src={`http://localhost:3001${entry.audioUrl}`}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          ))}

          {entries.length === 0 && (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No journal entries</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your first entry</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 