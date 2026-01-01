import { type Gratitude } from "./ThankMap"
import { forwardRef, useState } from 'react'; // Added useState

interface MessageCardProps {
  data: {
    message: string;
    short_code?: string; // This is now used
    lat: number;
    lng: number;
    variant: number;
  };
  onClose: () => void;
}

const MessageCard = forwardRef<HTMLDivElement, MessageCardProps>( 
  ({data, onClose}, ref ) => {
    const [copyFeedback, setCopyFeedback] = useState(false);

    const handleShare = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent map click

      if (data.short_code) {
        // Build the link dynamically (works on localhost AND production)
        const link = `${window.location.origin}/share/${data.short_code}`;
        
        navigator.clipboard.writeText(link).then(() => {
          setCopyFeedback(true);
          // Reset button text after 2 seconds
          setTimeout(() => setCopyFeedback(false), 2000);
        });
      }
    };

    return (
      <div 
        ref={ref} 
        className="glow-card"
        style={{
          position: 'absolute',
          top: 0, 
          left: 0,
          willChange: 'transform',
          backgroundColor: 'rgba(20, 20, 20, 0.90)',
          backdropFilter: 'blur(10px)',
          padding: '20px',
          borderRadius: '15px',
          border: '1px solid rgba(255, 215, 0, 0.4)',
          color: 'white',
          width: '300px',
          zIndex: 1500,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          marginTop: '-20px', 
          transform: 'translate(-50%, -100%)',
          opacity: 1,
          transition: 'opacity 0.3s ease-in-out'
        }}
      >
        {/* Close Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation(); 
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '5px',
            right: '10px',
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '18px',
            cursor: 'pointer',
            pointerEvents: 'auto'
          }}
        >
          ✕
        </button>

        <h4 style={{ color: '#ffd700', margin: '0 0 8px 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Gratitude
        </h4>
        
        <p style={{ fontSize: '16px', lineHeight: '1.4', margin: '0 0 15px 0', fontStyle: 'italic' }}>
          "{data.message}"
        </p>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>
            Near {data.lat.toFixed(2)}, {data.lng.toFixed(2)}
            </div>

            {/* NEW: Share Button */}
            {data.short_code && (
                <button 
                    onClick={handleShare}
                    style={{
                        background: copyFeedback ? '#4CAF50' : 'rgba(255, 215, 0, 0.1)',
                        border: copyFeedback ? '1px solid #4CAF50' : '1px solid #ffd700',
                        color: copyFeedback ? 'white' : '#ffd700',
                        borderRadius: '4px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                    }}
                >
                    {copyFeedback ? (
                        <>✓ Copied</>
                    ) : (
                        <>🔗 Share</>
                    )}
                </button>
            )}
        </div>
        
        {/* Triangle Arrow */}
        <div style={{
          position: 'absolute',
          bottom: '-8px',
          left: '50%',
          marginLeft: '-8px',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid rgba(255, 215, 0, 0.4)'
        }} />
      </div>
    );
  }
);

export default MessageCard;