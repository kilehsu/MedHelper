'use client';

import { useState, useRef, useEffect } from 'react';

export default function MedicationScanner({ onScan }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const ErrorPopup = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="bg-red-100 p-2 rounded-full">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 ml-3">Scanning Issue</h3>
        </div>
        <p className="text-gray-600 mb-4">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );

  const LoadingOverlay = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900">Processing Image</h3>
          <p className="text-gray-600 text-center mt-2">Analyzing medication information...</p>
        </div>
      </div>
    </div>
  );

  // Effect to handle video element initialization
  useEffect(() => {
    if (isScanning && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play().catch(e => {
          setError('Error starting camera: ' + e.message);
        });
      };
    }
  }, [isScanning, videoRef.current]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setError('');

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user', // Changed to front camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      setIsScanning(true);
      
    } catch (err) {
      setError(`Error accessing camera: ${err.message}`);
      console.error('Camera access error:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    setIsScanning(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsProcessing(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    context.scale(-1, 1);
    context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          const formData = new FormData();
          formData.append('image', blob, 'medicine.jpg');

          const response = await fetch('https://medi-minder-d66fcfda1bec.herokuapp.com/recognize-medicine', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Could not process the image. Please try scanning again.`);
          }

          const data = await response.json();
          
          if (data.error) {
            const errorMessage = "Could not identify the medication clearly. Please try scanning again with better lighting and make sure the medication label is clearly visible.";
            throw new Error(errorMessage);
          }

          const voiceResponse = await fetch('https://medi-minder-d66fcfda1bec.herokuapp.com/speak-medication', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: `I have scanned your medication. Here's what I found: ${data.medicineInfo}`
            }),
          });

          if (!voiceResponse.ok) {
            console.error('Voice feedback failed:', await voiceResponse.text());
          } else {
            const voiceData = await voiceResponse.json();
            const audio = new Audio(`https://medi-minder-d66fcfda1bec.herokuapp.com${voiceData.audioUrl}`);
            await audio.play();
          }
          
          onScan({
            imageBlob: blob,
            medicineInfo: data.medicineInfo,
            success: true
          });
          
          stopCamera();
          
        } catch (err) {
          setError(err.message);
          onScan({ success: false, error: err.message });
        } finally {
          setIsProcessing(false);
        }
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="space-y-4">
      {error && <ErrorPopup message={error} onClose={() => setError('')} />}
      {isProcessing && <LoadingOverlay />}

      {!isScanning && (
        <button
          onClick={startCamera}
          disabled={isProcessing}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium text-lg"
        >
          Start Scanner
        </button>
      )}
      
      {isScanning && !isProcessing && (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          
          <div className="flex justify-center space-x-4">
            <button
              onClick={captureImage}
              disabled={isProcessing}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium text-lg"
            >
              {isProcessing ? 'Processing...' : 'Capture Image'}
            </button>
            
            <button
              onClick={stopCamera}
              disabled={isProcessing}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium text-lg"
            >
              Stop Scanner
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 