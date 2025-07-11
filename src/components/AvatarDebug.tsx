import React, { useState, useEffect } from 'react';

interface AvatarDebugProps {
  avatarSeed?: string;
  id: string;
  name: string;
}

export default function AvatarDebug({ avatarSeed, id, name }: AvatarDebugProps) {
  const [debugInfo, setDebugInfo] = useState<{
    dicebearUrl: string;
    fallbackUrl: string;
    dicebearStatus: 'loading' | 'success' | 'error';
    fallbackStatus: 'loading' | 'success' | 'error';
    error?: string;
  }>({
    dicebearUrl: '',
    fallbackUrl: '',
    dicebearStatus: 'loading',
    fallbackStatus: 'loading'
  });

  const getDicebearUrl = () => {
    if (avatarSeed && avatarSeed.includes('-')) {
      const [style, seed] = avatarSeed.split('-');
      return `https://api.dicebear.com/7.x/${style.toLowerCase()}/svg?seed=${seed}`;
    }
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
  };

  const getFallbackUrl = () => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=random&color=fff&size=128&rounded=true&format=svg`;
  };

  useEffect(() => {
    const dicebearUrl = getDicebearUrl();
    const fallbackUrl = getFallbackUrl();
    
    setDebugInfo(prev => ({
      ...prev,
      dicebearUrl,
      fallbackUrl
    }));

    // Test DiceBear URL
    const testDicebear = async () => {
      try {
        const response = await fetch(dicebearUrl);
        if (response.ok) {
          setDebugInfo(prev => ({ ...prev, dicebearStatus: 'success' }));
        } else {
          setDebugInfo(prev => ({ 
            ...prev, 
            dicebearStatus: 'error',
            error: `DiceBear HTTP ${response.status}: ${response.statusText}`
          }));
        }
      } catch (error) {
        setDebugInfo(prev => ({ 
          ...prev, 
          dicebearStatus: 'error',
          error: `DiceBear Network Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
      }
    };

    // Test Fallback URL
    const testFallback = async () => {
      try {
        const response = await fetch(fallbackUrl);
        if (response.ok) {
          setDebugInfo(prev => ({ ...prev, fallbackStatus: 'success' }));
        } else {
          setDebugInfo(prev => ({ 
            ...prev, 
            fallbackStatus: 'error',
            error: prev.error ? `${prev.error} | Fallback HTTP ${response.status}: ${response.statusText}` : `Fallback HTTP ${response.status}: ${response.statusText}`
          }));
        }
      } catch (error) {
        setDebugInfo(prev => ({ 
          ...prev, 
          fallbackStatus: 'error',
          error: prev.error ? `${prev.error} | Fallback Network Error: ${error instanceof Error ? error.message : 'Unknown error'}` : `Fallback Network Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
      }
    };

    testDicebear();
    testFallback();
  }, [avatarSeed, id, name]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontSize: '12px',
      maxWidth: '400px',
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#10b981' }}>Avatar Debug Info</h3>
      <div style={{ marginBottom: '8px' }}>
        <strong>User:</strong> {name} ({id})
      </div>
      <div style={{ marginBottom: '8px' }}>
        <strong>Avatar Seed:</strong> {avatarSeed || 'None'}
      </div>
      <div style={{ marginBottom: '8px' }}>
        <strong>DiceBear Status:</strong> 
        <span style={{ 
          color: debugInfo.dicebearStatus === 'success' ? '#10b981' : 
                debugInfo.dicebearStatus === 'error' ? '#ef4444' : '#f59e0b',
          marginLeft: '8px'
        }}>
          {debugInfo.dicebearStatus}
        </span>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <strong>Fallback Status:</strong> 
        <span style={{ 
          color: debugInfo.fallbackStatus === 'success' ? '#10b981' : 
                debugInfo.fallbackStatus === 'error' ? '#ef4444' : '#f59e0b',
          marginLeft: '8px'
        }}>
          {debugInfo.fallbackStatus}
        </span>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '10px' }}>
        <strong>DiceBear URL:</strong><br/>
        <a href={debugInfo.dicebearUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>
          {debugInfo.dicebearUrl}
        </a>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '10px' }}>
        <strong>Fallback URL:</strong><br/>
        <a href={debugInfo.fallbackUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>
          {debugInfo.fallbackUrl}
        </a>
      </div>
      {debugInfo.error && (
        <div style={{ marginTop: '8px', color: '#ef4444', fontSize: '10px' }}>
          <strong>Error:</strong> {debugInfo.error}
        </div>
      )}
    </div>
  );
} 