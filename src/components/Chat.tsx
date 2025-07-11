import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send } from 'lucide-react';

interface ChatProps {
  socket: Socket | null;
  currentUserId: string;
  currentUserName: string;
  onMessageSent?: (message: string) => void;
}

interface Message {
  from: string;
  fromName: string;
  message: string;
  timestamp: Date;
  own?: boolean;
}

export default function Chat({ socket, currentUserId, currentUserName, onMessageSent }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg: Message) => {
      const isOwnMessage = msg.from === currentUserId;
      setMessages(prev => [...prev, { ...msg, own: isOwnMessage }]);
    };

    socket.on('chat:message', handleMessage);

    return () => {
      socket.off('chat:message', handleMessage);
    };
  }, [socket, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!socket || !inputMessage.trim()) return;

    const message = inputMessage.trim();
    
    socket.emit('chat:message', {
      message: message,
      fromName: currentUserName
    });

    // Trigger chat bubble
    if (onMessageSent) {
      onMessageSent(message);
    }

    setInputMessage('');
  };

  if (!socket) return null;

  return (
    <div style={{
      borderRadius: '0 0 32px 32px',
      background: 'transparent',
      height: isMinimized ? '60px' : '600px', // Fixed absolute height
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Minimize/Maximize Toggle */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        padding: '16px 32px',
        zIndex: 10
      }}>
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '16px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
          }}
        >
          {isMinimized ? '▲ Expand' : '▼ Collapse'}
        </button>
      </div>

      {/* Messages Area - Absolutely Positioned */}
      {!isMinimized && (
        <>
          <div style={{
            position: 'absolute',
            top: '80px', // Below toggle button
            left: 0,
            right: 0,
            bottom: '120px', // Above input area
            overflowY: 'auto',
            padding: '0 32px',
            background: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent'
          }}>
            {messages.length === 0 ? (
              <div style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '15px',
                textAlign: 'center',
                padding: '48px 24px',
                fontStyle: 'italic',
                background: 'rgba(236, 72, 153, 0.08)',
                borderRadius: '24px',
                border: '1px solid rgba(236, 72, 153, 0.2)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '56px',
                  opacity: 0.1,
                  zIndex: -1
                }}>
                  💬
                </div>
                <div style={{
                  fontSize: '18px',
                  marginBottom: '8px',
                  fontWeight: '600'
                }}>
                  ✨ Ready to Chat
                </div>
                <div style={{
                  fontSize: '14px',
                  color: 'rgba(255, 255, 255, 0.5)'
                }}>
                  Start the conversation with your team
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  animation: 'activity-appear 0.4s ease-out'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    justifyContent: msg.own ? 'flex-end' : 'flex-start'
                  }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: msg.own 
                        ? '#ec4899'
                        : '#10b981',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                      background: msg.own 
                        ? 'rgba(236, 72, 153, 0.1)'
                        : 'rgba(16, 185, 129, 0.1)',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      border: msg.own 
                        ? '1px solid rgba(236, 72, 153, 0.2)'
                        : '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                      {msg.own ? 'You' : msg.fromName}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: 'rgba(255, 255, 255, 0.5)',
                      fontWeight: '500'
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '15px',
                    color: 'white',
                    background: msg.own 
                      ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%)'
                      : 'rgba(255, 255, 255, 0.08)',
                    padding: '16px 20px',
                    borderRadius: '20px',
                    border: msg.own 
                      ? '1px solid rgba(236, 72, 153, 0.25)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: msg.own 
                      ? '0 4px 20px rgba(236, 72, 153, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                      : '0 4px 20px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    alignSelf: msg.own ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    wordWrap: 'break-word',
                    fontWeight: '500',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {msg.own && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: '-100%',
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(236, 72, 153, 0.1), transparent)',
                        animation: 'shine 3s infinite'
                      }}></div>
                    )}
                    {msg.message}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Absolutely Positioned at Bottom */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '120px', // Fixed height
            padding: '20px 32px 32px',
            background: 'transparent',
            borderRadius: '0 0 32px 32px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center'
          }}>
            <div style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              width: '100%'
            }}>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type your message..."
                style={{
                  flex: 1,
                  padding: '16px 20px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '20px',
                  fontSize: '15px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'white',
                  outline: 'none',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(10px)',
                  fontWeight: '500',
                  height: '56px', // Fixed height
                  resize: 'none' // Prevent resizing
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.5)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(236, 72, 153, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
              />
              <button
                onClick={sendMessage}
                style={{
                  background: 'linear-gradient(135deg, #ec4899 0%, #9333ea 100%)',
                  color: 'white',
                  padding: '0',
                  borderRadius: '20px',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                  cursor: 'pointer',
                  boxShadow: '0 8px 32px rgba(236, 72, 153, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '56px', // Fixed width
                  height: '56px', // Fixed height
                  flexShrink: 0, // Don't shrink
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 12px 48px rgba(236, 72, 153, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(236, 72, 153, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                }}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </>
      )}
      
      <style jsx>{`
        /* Input placeholder styling */
        input::placeholder {
          color: rgba(255, 255, 255, 0.5);
          font-weight: 500;
        }
        
        /* Custom scrollbar - already handled in globals.css */
      `}</style>
    </div>
  );
}