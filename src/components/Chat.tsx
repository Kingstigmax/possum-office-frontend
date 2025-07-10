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
    <div className="bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="bg-blue-500 text-white px-4 py-3 rounded-t-lg flex justify-between items-center">
        <span className="font-semibold">Team Chat</span>
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className="hover:bg-blue-600 px-2 py-1 rounded text-sm"
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {/* Messages */}
      {!isMinimized && (
        <>
          <div className="h-64 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-blue-600">
                      {msg.own ? 'You' : msg.fromName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 bg-white p-2 rounded">
                    {msg.message}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 bg-white rounded-b-lg">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={sendMessage}
                className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 flex-shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}