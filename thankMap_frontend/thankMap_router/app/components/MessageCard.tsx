import { type Gratitude } from "./ThankMap"
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

interface MessageCardProps {
  data: {
    message: string;
    short_code?: string;
    lat: number;
    lng: number;
    variant: number;
    id: number;
  };
  onClose: () => void;
  position?: number; // 0, 1, 2 for stacking
  totalCards?: number; // How many cards total
}

export default function MessageCard({ 
  data, 
  onClose, 
  position = 0,
  totalCards = 1 
}: MessageCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // ============================================================================
  // POSITIONING LOGIC
  // ============================================================================

  const getCardPosition = () => {
    if (totalCards === 1) {
      // Single card - center it
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    // Multiple cards - arrange them in a row
    const cardWidth = 320; // Card width + margin
    const totalWidth = totalCards * cardWidth;
    const startX = (window.innerWidth - totalWidth) / 2;

    return {
      top: '50%',
      left: `${startX + (position * cardWidth)}px`,
      transform: 'translateY(-50%)'
    };
  };

  // ============================================================================
  // SHARE HANDLER
  // ============================================================================

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (data.short_code) {
      const link = `${window.location.origin}/share/${data.short_code}`;
      
      navigator.clipboard.writeText(link).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      });
    }
  };

  // ============================================================================
  // STYLES
  // ============================================================================

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    ...getCardPosition(),
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    backdropFilter: 'blur(15px)',
    padding: '25px',
    borderRadius: '20px',
    border: '1px solid rgba(255, 215, 0, 0.3)',
    color: 'white',
    width: '300px',
    maxWidth: '90vw',
    zIndex: 1500 + position, // Stack properly
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 215, 0, 0.2)',
    opacity: 1,
    transition: 'all 0.3s ease-in-out',
    animation: 'fadeIn 0.3s ease-in-out'
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-50%) scale(0.9);
            }
            to {
              opacity: 1;
              transform: translateY(-50%) scale(1);
            }
          }

          .glow-card {
            box-shadow: 
              0 10px 40px rgba(0, 0, 0, 0.7), 
              0 0 20px rgba(255, 215, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }

          .glow-card:hover {
            border-color: rgba(255, 215, 0, 0.5);
            box-shadow: 
              0 15px 50px rgba(0, 0, 0, 0.8), 
              0 0 30px rgba(255, 215, 0, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
        `}
      </style>

      <div 
        ref={cardRef}
        className="glow-card"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation(); 
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#888';
          }}
        >
          ✕
        </button>

        {/* Header */}
        <h4 
          style={{ 
            color: '#ffd700', 
            margin: '0 0 15px 0', 
            fontSize: '11px', 
            textTransform: 'uppercase', 
            letterSpacing: '2px',
            fontWeight: 600
          }}
        >
          💫 Gratitude
        </h4>
        
        {/* Message */}
        <p 
          style={{ 
            fontSize: '17px', 
            lineHeight: '1.6', 
            margin: '0 0 20px 0', 
            fontStyle: 'italic',
            color: '#e0e0e0'
          }}
        >
          "{data.message}"
        </p>
        
        {/* Footer */}
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            paddingTop: '15px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* Location */}
          <div 
            style={{ 
              fontSize: '11px', 
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <span style={{ opacity: 0.5 }}>📍</span>
            <span>{data.lat.toFixed(2)}, {data.lng.toFixed(2)}</span>
          </div>

          {/* Share Button */}
          {data.short_code && (
            <button 
              onClick={handleShare}
              style={{
                background: copyFeedback 
                  ? 'rgba(76, 175, 80, 0.2)' 
                  : 'rgba(255, 215, 0, 0.1)',
                border: copyFeedback 
                  ? '1px solid #4CAF50' 
                  : '1px solid rgba(255, 215, 0, 0.3)',
                color: copyFeedback ? '#4CAF50' : '#ffd700',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={(e) => {
                if (!copyFeedback) {
                  e.currentTarget.style.background = 'rgba(255, 215, 0, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!copyFeedback) {
                  e.currentTarget.style.background = 'rgba(255, 215, 0, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.3)';
                }
              }}
            >
              {copyFeedback ? (
                <>✓ Copied!</>
              ) : (
                <>🔗 Share</>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
