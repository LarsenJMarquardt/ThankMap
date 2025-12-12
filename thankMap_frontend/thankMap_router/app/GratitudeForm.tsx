// app/GratitudeForm.tsx
import React, { useState } from 'react';

interface SubmissionData {
    message: string;
    lat: number;
    lng: number;
    tempId: string;
}

interface GratitudeFormProps {
  onSubmit: (data: SubmissionData) => void;
}

const GratitudeForm: React.FC<GratitudeFormProps> = ({ onSubmit }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const MAX_CHARS = 280;

  const handleSubmit = () => {
    if (!message.trim()) return;
    setLoading(true);

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSubmit({
          message, 
          lat: position.coords.latitude, 
          lng: position.coords.longitude,
          tempId: Math.random().toString(36).substring(2, 9) 
        });
        setMessage('');
        setLoading(false);
        setIsOpen(false);
      },
      (error) => {
        console.error(error);
        alert("We need your location to place the light on the map.");
        setLoading(false);
      }
    );
  };

  // --- STYLES ---
  const styles: Record<string, React.CSSProperties> = {
    floatingBtn: {
      position: 'absolute',
      bottom: '40px',
      right: '30px',
      padding: '15px 30px',
      borderRadius: '50px',
      border: 'none',
      backgroundColor: '#ffd700', // Gold
      color: '#000',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
      zIndex: 1000, // vital to sit on top of map
      transition: 'transform 0.2s',
    },
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(5px)'
    },
    modal: {
      backgroundColor: '#1a1a1a',
      padding: '30px',
      borderRadius: '20px',
      width: '90%',
      maxWidth: '400px',
      border: '1px solid #333',
      color: 'white',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
    },
    title: { marginTop: 0, marginBottom: '20px', fontSize: '24px' },
    textarea: {
      width: '100%',
      height: '120px',
      backgroundColor: '#333',
      border: '1px solid #444',
      color: 'white',
      padding: '15px',
      borderRadius: '10px',
      marginBottom: '20px',
      fontSize: '16px',
      resize: 'none',
      outline: 'none',
    },
    btnGroup: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
    btn: {
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px'
    }
  };

  if (!isOpen) {
    return (
      <button style={styles.floatingBtn} onClick={() => setIsOpen(true)}>
        + Share Gratitude
      </button>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>What are you thankful for?</h3>
        
        <textarea
          style={styles.textarea}
          placeholder="I am thankful for..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_CHARS} // <--- 2. Enforce the limit
        />

        {/* 3. The Character Counter (NEW) */}
        <div style={{ 
          textAlign: 'right', 
          fontSize: '12px', 
          color: message.length >= MAX_CHARS ? '#ff4444' : '#888', // Turn red at limit
          marginBottom: '15px',
          marginTop: '-10px'
        }}>
          {message.length} / {MAX_CHARS}
        </div>

        <div style={styles.btnGroup}>
           <button 
             style={{...styles.btn, backgroundColor: 'transparent', color: '#aaa'}} 
             onClick={() => setIsOpen(false)}
           >
             Cancel
           </button>
           <button 
             style={{...styles.btn, backgroundColor: '#ffd700', color: 'black', opacity: loading ? 0.5 : 1}} 
             onClick={handleSubmit} 
             disabled={loading}
           >
             {loading ? 'Locating...' : 'Light it up'}
           </button>
        </div>
      </div>
    </div>
  );
};

export default GratitudeForm;