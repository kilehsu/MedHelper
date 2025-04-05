import { NextResponse } from 'next/server';

// This function connects to the voice backend service
async function processVoice(text, nurseName = 'Sarah', personalized = true) {
  try {
    // Call the voice backend service
    const response = await fetch('http://localhost:3001/process-voice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        nurseName,
        personalized
      })
    });

    if (!response.ok) {
      throw new Error(`Voice backend error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling voice backend:', error);
    throw error;
  }
}

export async function POST(request) {
  try {
    const { text, nurseName, personalized } = await request.json();
    
    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }
    
    // Process the voice using the voice backend service
    const result = await processVoice(text, nurseName, personalized);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing voice:', error);
    return NextResponse.json(
      { error: 'Failed to process voice' },
      { status: 500 }
    );
  }
} 