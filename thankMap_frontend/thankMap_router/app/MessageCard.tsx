import { type Gratitude } from "./ThankMap"
import { forwardRef } from 'react';

interface MessageCardProps {
  data: Gratitude;
  onClose: () => void;
}

// Wrap the component in forwardRef so the parent can control its position
const MessageCard = forwardRef<HTMLDivElement, MessageCardProps>( 
  ({data, onClose}, ref ) => {
    return (
      <div 
        ref={ref} // <--- Attach the ref here
        className="glow-card"
        style={{
          position: 'absolute',
          top: 0, 
          left: 0,
          // We will control 'transform' via JS, so we start hidden to avoid a jump
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
          // Anchor the bottom-center of the card to the point (like a speech bubble)
          marginTop: '-20px', 
          transform: 'translate(-50%, -100%)',
          opacity: 1,
          transition: 'opacity 0.3s ease-in-out'
        }}
      >
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Prevent map click-through
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
        <div style={{ fontSize: '11px', color: '#666' }}>
          Near {data.lat.toFixed(2)}, {data.lng.toFixed(2)}
        </div>
        
        {/* Optional: A little triangle arrow pointing down */}
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