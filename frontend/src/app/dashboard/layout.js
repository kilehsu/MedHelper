'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'firebase/auth';
import MedicationQuiz from '@/components/MedicationQuiz';
import { JournalComponent } from '../journal/page';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [showQuiz, setShowQuiz] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('showMedicationQuiz') === 'true';
    }
    return false;
  });
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('showMedicationQuiz', showQuiz);
    }
  }, [showQuiz]);

  const handleNavigation = (view) => {
    setCurrentView(view);
    if (view === 'quiz') {
      setShowQuiz(true);
    } else {
      setShowQuiz(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-3">
              <Image
                src="/logo.png"
                alt="MediMinder Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <button 
                onClick={() => handleNavigation('dashboard')}
                className="text-2xl font-bold text-blue-600 flex items-center"
              >
                MediMinder
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => handleNavigation('dashboard')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentView === 'dashboard' && !showQuiz
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:text-blue-600'
                }`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => handleNavigation('quiz')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  showQuiz
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-700 hover:text-blue-600'
                }`}
              >
                Medication Quiz
              </button>
              <button 
                onClick={() => handleNavigation('journal')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentView === 'journal'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:text-blue-600'
                }`}
              >
                Symptom Journal
              </button>
              <span className="text-gray-700">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="bg-red-500 text-white hover:bg-red-600 px-4 py-2 rounded-md text-sm font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {currentView === 'dashboard' && !showQuiz && children}
        {showQuiz && <MedicationQuiz />}
        {currentView === 'journal' && <JournalComponent />}
      </main>
    </div>
  );
} 