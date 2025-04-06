'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import MedicationScanner from '@/components/MedicationScanner';

export default function Dashboard() {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [editingMedication, setEditingMedication] = useState(null);
  const [error, setError] = useState(null);
  const [playingMedicationId, setPlayingMedicationId] = useState(null);
  const [newMedication, setNewMedication] = useState({
    name: '',
    dosage: '',
    frequency: '',
    notes: ''
  });

  useEffect(() => {
    fetchMedications();
  }, []);

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
    } catch (error) {
      console.error('Error fetching medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const ErrorPopup = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="bg-red-100 p-2 rounded-full">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 ml-3">Error</h3>
        </div>
        <p className="text-gray-600 mb-4">{message}</p>
        <button
          onClick={onClose}
          className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );

  const handleScan = async (scanResult) => {
    if (!scanResult.success) {
      setError(scanResult.error);
      return;
    }

    try {
      // Parse the medicine information from the AI
      const medicineInfo = scanResult.medicineInfo;
      
      // Initialize parsed info
      let parsedInfo = {
        name: '',
        dosage: '',
        frequency: '',
        notes: ''
      };

      // Check if the response is in the expected format
      const nameMatch = medicineInfo.match(/Medication Name:\s*(.+?)(?=\n|$)/);
      const dosageMatch = medicineInfo.match(/Dosage:\s*(.+?)(?=\n|$)/);
      const frequencyMatch = medicineInfo.match(/Frequency:\s*(.+?)(?=\n|$)/);
      const notesMatch = medicineInfo.match(/Notes:\s*(.+?)(?=\n|$)/);

      if (nameMatch) parsedInfo.name = nameMatch[1].trim();
      if (dosageMatch) parsedInfo.dosage = dosageMatch[1].trim();
      if (frequencyMatch) parsedInfo.frequency = frequencyMatch[1].trim();
      if (notesMatch) parsedInfo.notes = notesMatch[1].trim();

      // Validate that we have the required fields
      if (!parsedInfo.name || !parsedInfo.dosage || !parsedInfo.frequency) {
        throw new Error('Could not extract all required medication information. Please try scanning again.');
      }

      // Update the form with the parsed information
      setNewMedication(parsedInfo);
      setShowScanner(false);

    } catch (error) {
      console.error('Error processing scan result:', error);
      setError(error.message || 'Failed to process the scanned medication. Please try again.');
    }
  };

  const handleAddMedication = async (e) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) return;

      await addDoc(collection(db, 'medications'), {
        ...newMedication,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        nextDose: new Date().toISOString() // You would calculate this based on frequency
      });

      setNewMedication({
        name: '',
        dosage: '',
        frequency: '',
        notes: ''
      });
      fetchMedications();
    } catch (error) {
      console.error('Error adding medication:', error);
    }
  };

  const handleEditClick = (medication) => {
    setEditingMedication(medication);
    setNewMedication({
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      notes: medication.notes || ''
    });
  };

  const handleUpdateMedication = async (e) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) return;

      const medicationRef = doc(db, 'medications', editingMedication.id);
      await updateDoc(medicationRef, {
        ...newMedication,
        updatedAt: new Date().toISOString()
      });

      setEditingMedication(null);
      setNewMedication({
        name: '',
        dosage: '',
        frequency: '',
        notes: ''
      });
      fetchMedications();
    } catch (error) {
      console.error('Error updating medication:', error);
    }
  };

  const handleDeleteMedication = async (medicationId) => {
    if (window.confirm('Are you sure you want to delete this medication?')) {
      try {
        await deleteDoc(doc(db, 'medications', medicationId));
        fetchMedications();
      } catch (error) {
        console.error('Error deleting medication:', error);
      }
    }
  };

  // Add function to speak medication details
  const speakMedication = async (medication) => {
    if (playingMedicationId === medication.id) {
      // If this medication is already playing, stop it
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      setPlayingMedicationId(null);
      return;
    }
    
    // If another medication is playing, stop it first
    if (playingMedicationId) {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
    
    try {
      setPlayingMedicationId(medication.id);
      const text = `Here are the details for ${medication.name}: 
        The dosage is ${medication.dosage}. 
        Take it ${medication.frequency}. 
        ${medication.notes ? 'Additional notes: ' + medication.notes : ''}`;

      const response = await fetch('http://localhost:3001/speak-medication', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to get voice response');
      }

      const data = await response.json();
      
      // Create a unique ID for this audio element
      const audioId = `audio-${medication.id}`;
      
      // Remove any existing audio elements
      const existingAudio = document.getElementById(audioId);
      if (existingAudio) {
        existingAudio.remove();
      }
      
      // Create a new audio element with a unique ID
      const audio = new Audio(`http://localhost:3001${data.audioUrl}`);
      audio.id = audioId;
      
      audio.onended = () => {
        setPlayingMedicationId(null);
      };
      
      audio.onerror = () => {
        console.error('Error playing audio');
        setPlayingMedicationId(null);
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing voice:', error);
      setPlayingMedicationId(null);
      setError('Failed to play voice feedback. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {error && <ErrorPopup message={error} onClose={() => setError(null)} />}
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900">Your Medications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track and manage your medications in one place
        </p>
      </div>

      {/* Add/Edit Medication Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {editingMedication ? 'Edit Medication' : 'Add New Medication'}
          </h2>
          <button
            onClick={() => setShowScanner(!showScanner)}
            className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-4 py-2 rounded-md font-medium transition-colors"
          >
            {showScanner ? 'Hide Scanner' : 'Scan Medication'}
          </button>
        </div>

        {showScanner ? (
          <MedicationScanner onScan={handleScan} />
        ) : (
          <form onSubmit={editingMedication ? handleUpdateMedication : handleAddMedication} className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Medication Name</label>
              <input
                type="text"
                value={newMedication.name}
                onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })}
                className="block w-full rounded-md border-2 border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 text-base"
                required
                placeholder="Enter medication name"
              />
            </div>
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Dosage</label>
              <input
                type="text"
                value={newMedication.dosage}
                onChange={(e) => setNewMedication({ ...newMedication, dosage: e.target.value })}
                className="block w-full rounded-md border-2 border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 text-base"
                required
                placeholder="e.g., 500mg, 1 tablet"
              />
            </div>
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Frequency</label>
              <input
                type="text"
                value={newMedication.frequency}
                onChange={(e) => setNewMedication({ ...newMedication, frequency: e.target.value })}
                className="block w-full rounded-md border-2 border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 text-base"
                required
                placeholder="e.g., Twice daily, Every 8 hours"
              />
            </div>
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Notes</label>
              <textarea
                value={newMedication.notes}
                onChange={(e) => setNewMedication({ ...newMedication, notes: e.target.value })}
                className="block w-full rounded-md border-2 border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 text-base"
                rows="3"
                placeholder="Any additional notes or instructions"
              />
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors font-medium text-base"
              >
                {editingMedication ? 'Update Medication' : 'Add Medication'}
              </button>
              {editingMedication && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMedication(null);
                    setNewMedication({
                      name: '',
                      dosage: '',
                      frequency: '',
                      notes: ''
                    });
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 px-4 py-3 rounded-md hover:bg-gray-300 transition-colors font-medium text-base"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Medications List */}
      <div className="bg-white shadow rounded-lg">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading medications...</div>
        ) : medications.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No medications added yet. Add your first medication above.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {medications.map((medication) => (
              <div key={medication.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{medication.name}</h3>
                    <p className="text-sm text-gray-500">{medication.dosage}</p>
                    <p className="text-sm text-gray-500">Frequency: {medication.frequency}</p>
                    {medication.notes && (
                      <p className="text-sm text-gray-500 mt-1">Notes: {medication.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-4">å
                    <button
                      onClick={() => speakMedication(medication)}
                      disabled={playingMedicationId !== null && playingMedicationId !== medication.id}
                      className={`text-blue-600 hover:text-blue-800 font-medium flex items-center ${playingMedicationId !== null && playingMedicationId !== medication.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                      {playingMedicationId === medication.id ? 'Speaking...' : 'Speak'}
                    </button>
                    <button 
                      onClick={() => handleEditClick(medication)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteMedication(medication.id)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
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