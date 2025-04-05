'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import JournalAnalyzer from '@/components/JournalAnalyzer';

export default function Journal() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEntry, setNewEntry] = useState('');
  const [insights, setInsights] = useState(null);
  const [showInsights, setShowInsights] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [medications, setMedications] = useState([]);
  const [selectedMedication, setSelectedMedication] = useState('');

  useEffect(() => {
    // Check if user is logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
        fetchEntries(user.uid);
        fetchMedications(user.uid);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchEntries = async (userId) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'journal'),
        where('userId', '==', userId)
        // Removed orderBy temporarily until index is created
      );
      const querySnapshot = await getDocs(q);
      const journalEntries = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEntries(journalEntries);
      setError(null); // Clear any previous errors
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      setError('Failed to load your journal entries. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMedications = async (userId) => {
    try {
      const q = query(
        collection(db, 'medications'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const userMedications = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMedications(userMedications);
    } catch (error) {
      console.error('Error fetching medications:', error);
    }
  };

  const handleAnalysisComplete = (analysisResult) => {
    setAnalysis(analysisResult);
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!newEntry.trim()) return;

    try {
      const user = auth.currentUser;
      if (!user) return;

      // Use the analysis if available, otherwise use empty arrays/values
      const entryData = {
        text: newEntry,
        userId: user.uid,
        timestamp: new Date().toISOString(),
        symptoms: analysis?.symptoms || [],
        timeAfterDose: analysis?.timeAfterDose || null,
        medication: selectedMedication || analysis?.medication || null,
        severity: analysis?.severity || null,
        confidence: analysis?.confidence || null
      };
      
      await addDoc(collection(db, 'journal'), entryData);

      setNewEntry('');
      setAnalysis(null);
      setSelectedMedication('');
      fetchEntries(user.uid);
      
      // Generate insights after adding an entry
      generateInsights(user.uid);
    } catch (error) {
      console.error('Error adding journal entry:', error);
      setError('Failed to save your entry. Please try again.');
    }
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setNewEntry(entry.text);
    setSelectedMedication(entry.medication || '');
    setAnalysis({
      symptoms: entry.symptoms || [],
      timeAfterDose: entry.timeAfterDose || null,
      medication: entry.medication || null,
      severity: entry.severity || null,
      confidence: entry.confidence || null
    });
    // Scroll to the form
    document.getElementById('entry-form').scrollIntoView({ behavior: 'smooth' });
  };

  const handleUpdateEntry = async (e) => {
    e.preventDefault();
    if (!newEntry.trim() || !editingEntry) return;

    try {
      const user = auth.currentUser;
      if (!user) return;

      const entryRef = doc(db, 'journal', editingEntry.id);
      
      // Update the entry with new data
      const updatedData = {
        text: newEntry,
        timestamp: new Date().toISOString(),
        symptoms: analysis?.symptoms || [],
        timeAfterDose: analysis?.timeAfterDose || null,
        medication: selectedMedication || analysis?.medication || null,
        severity: analysis?.severity || null,
        confidence: analysis?.confidence || null
      };
      
      await updateDoc(entryRef, updatedData);

      // Reset form
      setNewEntry('');
      setAnalysis(null);
      setSelectedMedication('');
      setEditingEntry(null);
      fetchEntries(user.uid);
      
      // Generate insights after updating an entry
      generateInsights(user.uid);
    } catch (error) {
      console.error('Error updating journal entry:', error);
      setError('Failed to update your entry. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setNewEntry('');
    setAnalysis(null);
    setSelectedMedication('');
  };

  const generateInsights = async (userId) => {
    try {
      // In a real implementation, this would call a backend service
      // that uses GPT to analyze patterns in the journal entries
      
      // Fetch all entries for the user
      const q = query(
        collection(db, 'journal'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const allEntries = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // For now, we'll generate a simple insight based on the most recent entries
      if (allEntries.length < 2) {
        setInsights({
          pattern: "Keep adding entries to get personalized insights about your symptoms and medications.",
          explanation: "The more data you provide, the better we can identify patterns and correlations.",
          recommendations: [
            "Add entries after each medication dose",
            "Be specific about timing and symptoms",
            "Include any relevant context"
          ]
        });
      } else {
        // Find the most common symptom-medication combination
        const symptomMedMap = {};
        
        allEntries.forEach(entry => {
          if (entry.symptoms && entry.symptoms.length > 0 && entry.medication) {
            const key = `${entry.medication}-${entry.symptoms.join(',')}`;
            symptomMedMap[key] = (symptomMedMap[key] || 0) + 1;
          }
        });
        
        // Find the most frequent combination
        let mostFrequent = null;
        let maxCount = 0;
        
        for (const [key, count] of Object.entries(symptomMedMap)) {
          if (count > maxCount) {
            maxCount = count;
            mostFrequent = key;
          }
        }
        
        if (mostFrequent && maxCount >= 2) {
          const [medication, symptoms] = mostFrequent.split('-');
          const symptomList = symptoms.split(',');
          
          setInsights({
            pattern: `You've reported ${symptomList.join(', ')} ${maxCount} times after taking ${medication}.`,
            explanation: `This could indicate a side effect of ${medication}. Side effects often occur within a specific timeframe after taking medication.`,
            recommendations: [
              `Consider taking ${medication} with food if possible`,
              `Discuss these symptoms with your healthcare provider`,
              `Monitor if the symptoms improve or worsen over time`
            ]
          });
        } else {
          setInsights({
            pattern: "We're starting to collect data about your symptoms and medications.",
            explanation: "As you add more entries, we'll be able to identify patterns and provide more specific insights.",
            recommendations: [
              "Continue logging your symptoms after each medication dose",
              "Be consistent with your entries",
              "Include timing information when possible"
            ]
          });
        }
      }
      
      setShowInsights(true);
    } catch (error) {
      console.error('Error generating insights:', error);
      setError('Failed to generate insights. Please try again later.');
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleShareWithDoctor = () => {
    // In a real implementation, this would generate a PDF report
    // and allow the user to share it with their doctor
    alert('This would generate a report to share with your doctor. This feature is coming soon!');
  };

  const handleDeleteEntry = async (entryId) => {
    if (!entryId) return;
    
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      // Show confirmation dialog
      if (!window.confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
        return;
      }
      
      // Delete the entry
      await deleteDoc(doc(db, 'journal', entryId));
      
      // Refresh entries
      fetchEntries(user.uid);
      
      // Generate insights after deleting an entry
      generateInsights(user.uid);
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      setError('Failed to delete your entry. Please try again.');
    }
  };

  if (!user) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900">Symptom Journal</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track your symptoms and side effects to identify patterns with AI assistance
        </p>
      </div>

      {/* Add/Edit Entry Section */}
      <div id="entry-form" className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          {editingEntry ? 'Edit Journal Entry' : 'Add New Entry'}
        </h2>
        <form onSubmit={editingEntry ? handleUpdateEntry : handleAddEntry} className="space-y-4">
          <div>
            <label className="block text-base font-semibold text-gray-800 mb-2">How are you feeling?</label>
            <textarea
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              className="block w-full rounded-md border-2 border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 text-base"
              rows="4"
              placeholder="Example: I felt dizzy 30 mins after taking the blue pill"
              required
            />
          </div>
          
          {/* Medication Dropdown */}
          <div>
            <label className="block text-base font-semibold text-gray-800 mb-2">Select Medication (Optional)</label>
            <select
              value={selectedMedication}
              onChange={(e) => setSelectedMedication(e.target.value)}
              className="block w-full rounded-md border-2 border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-blue-500 text-base"
            >
              <option value="">Select a medication</option>
              {medications.map((med) => (
                <option key={med.id} value={med.name}>
                  {med.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Analysis Section */}
          {newEntry.trim() && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-base font-semibold text-gray-800 mb-2">AI Analysis</h3>
              <JournalAnalyzer 
                entry={newEntry} 
                onAnalysisComplete={handleAnalysisComplete} 
              />
              
              {analysis && (
                <div className="mt-3 space-y-2">
                  {analysis.symptoms.length > 0 && (
                    <div>
                      <p className="text-base font-semibold text-gray-800">Symptoms detected:</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {analysis.symptoms.map((symptom, index) => (
                          <span key={index} className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                            {symptom}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {analysis.medication && !selectedMedication && (
                    <div>
                      <p className="text-base font-semibold text-gray-800">Medication:</p>
                      <p className="text-base text-gray-600">{analysis.medication}</p>
                    </div>
                  )}
                  
                  {analysis.timeAfterDose && (
                    <div>
                      <p className="text-base font-semibold text-gray-800">Time after dose:</p>
                      <p className="text-base text-gray-600">{analysis.timeAfterDose} minutes</p>
                    </div>
                  )}
                  
                  {analysis.severity && (
                    <div>
                      <p className="text-base font-semibold text-gray-800">Severity:</p>
                      <p className="text-base text-gray-600 capitalize">{analysis.severity}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end space-x-3">
            {editingEntry && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="bg-gray-200 text-gray-800 px-4 py-3 rounded-md hover:bg-gray-300 transition-colors font-medium text-base"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors font-medium text-base"
            >
              {editingEntry ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>

      {/* Insights Section */}
      {showInsights && insights && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">AI Insights</h2>
            <button
              onClick={() => setShowInsights(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <p className="text-blue-800 font-medium">{insights.pattern}</p>
          </div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Explanation</h3>
            <p className="text-gray-700">{insights.explanation}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Recommendations</h3>
            <ul className="list-disc pl-5 space-y-1">
              {insights.recommendations.map((rec, index) => (
                <li key={index} className="text-gray-700">{rec}</li>
              ))}
            </ul>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
              onClick={handleShareWithDoctor}
            >
              Share with Doctor
            </button>
          </div>
        </div>
      )}

      {/* Journal Entries List */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Your Journal Entries</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading entries...</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No journal entries yet. Add your first entry above.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {entries.map((entry) => (
              <div key={entry.id} className="p-6">
                <div className="flex justify-between">
                  <div className="flex-1">
                    <p className="text-gray-900">{entry.text}</p>
                    {entry.symptoms && entry.symptoms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.symptoms.map((symptom, index) => (
                          <span key={index} className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                            {symptom}
                          </span>
                        ))}
                      </div>
                    )}
                    {entry.medication && (
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Medication:</span> {entry.medication}
                        {entry.timeAfterDose && ` (${entry.timeAfterDose} minutes after dose)`}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex flex-col items-end">
                    <div className="text-sm text-gray-500">
                      {formatDate(entry.timestamp)}
                    </div>
                    <div className="mt-2 flex space-x-2">
                      <button
                        onClick={() => handleEditEntry(entry)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 