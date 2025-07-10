import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send } from 'lucide-react';

interface ChatProps {
  socket: Socket | null;
  currentUserId: string;
  currentUserName: string;
}

interface Message {
  from: string;
  fromName: string;
  message: string;
  timestamp: Date;
  own?: boolean;
}

export default function Chat({ socket, currentUserId, currentUserName }: ChatProps) {
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

    socket.emit('chat:message', {
      message: inputMessage.trim(),
      fromName: currentUserName
    });

    setInputMessage('');
  };

  if (!socket) return null;

  return (
    <div style={{
      borderRadius: '0 0 24px 24px',
      overflow: 'hidden',
      background: 'transparent'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '20px 25px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 8px 25px rgba(102, 126, 234, 0.3)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{
            fontSize: '20px'
          }}>💬</span>
          <span style={{
            fontSize: '18px',
            fontWeight: 'bold',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            Team Chat
          </span>
        </div>
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {/* Messages */}
      {!isMinimized && (
        <>
          <div style={{
            height: '320px',
            overflowY: 'auto',
            padding: '20px 25px',
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            {messages.length === 0 ? (
              <div style={{
                color: 'rgba(107, 114, 128, 0.8)',
                fontSize: '14px',
                textAlign: 'center',
                padding: '40px 20px',
                fontStyle: 'italic',
                background: 'rgba(102, 126, 234, 0.05)',
                borderRadius: '16px',
                border: '1px solid rgba(102, 126, 234, 0.1)'
              }}>
                ✨ No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  animation: 'message-appear 0.3s ease-out'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      background: msg.own 
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent'
                    }}>
                      {msg.own ? 'You' : msg.fromName}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: 'rgba(107, 114, 128, 0.6)'
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#374151',
                    background: msg.own 
                      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)'
                      : 'rgba(255, 255, 255, 0.8)',
                    padding: '12px 16px',
                    borderRadius: '16px',
                    border: msg.own 
                      ? '1px solid rgba(102, 126, 234, 0.2)'
                      : '1px solid rgba(255, 255, 255, 0.5)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
                    alignSelf: msg.own ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    wordWrap: 'break-word'
                  }}>
                    {msg.message}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '20px 25px',
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: '0 0 24px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <div style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-end'
            }}>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a magical message..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '2px solid rgba(102, 126, 234, 0.3)',
                  borderRadius: '16px',
                  fontSize: '14px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  outline: 'none',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.3)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
                }}
              />
              <button
                onClick={sendMessage}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '16px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '48px',
                  height: '48px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.4)';
                }}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </>
      )}
      
      <style jsx>{`
        @keyframes message-appear {
          0% { 
            opacity: 0; 
            transform: translateY(10px) scale(0.95); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #5a6fd8 0%, #6b5b95 100%);
        }
      `}</style>
    </div>
  );
}