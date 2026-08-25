'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Lock, Check, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMessages, type MessageType } from '@/hooks/useMessages';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessagingPanelProps {
  invoiceId: string;
  currentAddress: string;
  counterpartyAddress: string;
  /** Label shown in the header, e.g. "Lender" or "Business" */
  counterpartyLabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  text: 'Message',
  document_ref: 'Document Ref',
  term_proposal: 'Term Proposal',
};

const MESSAGE_TYPE_COLORS: Record<MessageType, string> = {
  text: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  document_ref: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  term_proposal: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MessagingPanel({
  invoiceId,
  currentAddress,
  counterpartyAddress,
  counterpartyLabel = 'Counterparty',
}: MessagingPanelProps) {
  const { messages, sendMessage, loading, error, markAsRead } = useMessages(
    invoiceId,
    currentAddress,
    counterpartyAddress,
  );

  const [inputValue, setInputValue] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('text');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark incoming messages as read when they appear in view.
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.sender_address !== currentAddress && msg.read_at === null) {
        markAsRead(msg.id);
      }
    });
  }, [messages, currentAddress, markAsRead]);

  // Typing indicator — cleared 1.5 s after the user stops typing.
  const handleInputChange = (value: string) => {
    setInputValue(value);
    setIsTyping(value.length > 0);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setIsTyping(false), 1_500);
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await sendMessage(trimmed, messageType);
      setInputValue('');
      setIsTyping(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Group messages by calendar date for date separators.
  const messagesByDate: { date: string; messages: typeof messages }[] = [];
  for (const msg of messages) {
    const date = formatDate(msg.created_at);
    const last = messagesByDate[messagesByDate.length - 1];
    if (last && last.date === date) {
      last.messages.push(msg);
    } else {
      messagesByDate.push({ date, messages: [msg] });
    }
  }

  return (
    <Card className="flex flex-col" aria-label="Private messaging panel">
      {/* Header */}
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-purple-500" aria-hidden="true" />
          Private Messages
          <Lock className="h-3.5 w-3.5 text-green-500 ml-1" aria-hidden="true" />
          <span className="text-xs font-normal text-gray-400 ml-1">End-to-end encrypted</span>
        </CardTitle>
        <p className="text-xs text-gray-400 mt-0.5">
          Conversation with{' '}
          <span className="font-medium text-gray-600">{counterpartyLabel}</span>{' '}
          <span className="font-mono">
            {counterpartyAddress.slice(0, 6)}…{counterpartyAddress.slice(-4)}
          </span>
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4">
        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex flex-col gap-1 overflow-y-auto max-h-80 min-h-[10rem] pr-1"
          role="log"
          aria-live="polite"
          aria-label="Message history"
        >
          {loading && (
            <div className="flex items-center justify-center h-full py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
              <span className="text-sm">Loading messages…</span>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          {!loading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-10 text-gray-400 gap-2">
              <Lock className="h-6 w-6 opacity-40" aria-hidden="true" />
              <p className="text-sm">No messages yet.</p>
              <p className="text-xs opacity-70">Messages are end-to-end encrypted.</p>
            </div>
          )}

          {!loading && !error && messagesByDate.map(({ date, messages: dayMsgs }) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                  {date}
                </span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              </div>

              {dayMsgs.map(msg => {
                const isSent = msg.sender_address === currentAddress;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    <div
                      className={`
                        max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed
                        ${isSent
                          ? 'bg-purple-600 text-white rounded-br-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                        }
                      `}
                    >
                      {/* Message type badge (if not plain text) */}
                      {msg.message_type !== 'text' && (
                        <Badge
                          className={`text-[10px] font-medium mb-1 px-1.5 py-0 ${MESSAGE_TYPE_COLORS[msg.message_type]}`}
                        >
                          {MESSAGE_TYPE_LABELS[msg.message_type]}
                        </Badge>
                      )}

                      <p className="break-words">{msg.content}</p>

                      {/* Timestamp + read receipt */}
                      <div
                        className={`flex items-center gap-1 mt-0.5 ${
                          isSent ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <span
                          className={`text-[10px] ${isSent ? 'text-purple-200' : 'text-gray-400'}`}
                        >
                          {formatTime(msg.created_at)}
                        </span>
                        {isSent && (
                          msg.read_at ? (
                            <CheckCheck
                              className="h-3 w-3 text-purple-200"
                              aria-label="Read"
                            />
                          ) : (
                            <Check
                              className="h-3 w-3 text-purple-300"
                              aria-label="Sent"
                            />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Typing indicator (local only) */}
          {isTyping && (
            <div className="flex justify-end mb-1">
              <div className="px-3 py-1.5 rounded-2xl rounded-br-sm bg-purple-100 dark:bg-purple-900/40 text-xs text-purple-500">
                Typing…
              </div>
            </div>
          )}
        </div>

        {/* Send error */}
        {sendError && (
          <p className="text-xs text-red-500 -mt-1" role="alert">
            {sendError}
          </p>
        )}

        {/* Input area */}
        <div className="flex flex-col gap-2">
          {/* Message type selector */}
          <div className="flex gap-1.5" role="group" aria-label="Message type">
            {(['text', 'document_ref', 'term_proposal'] as MessageType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setMessageType(type)}
                className={`
                  text-[11px] px-2.5 py-1 rounded-full border transition-colors
                  ${messageType === type
                    ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                  }
                `}
                aria-pressed={messageType === type}
              >
                {MESSAGE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              disabled={sending || loading}
              className="flex-1 text-sm"
              aria-label="Message input"
              maxLength={4000}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending || loading}
              aria-label="Send message"
              className="bg-purple-600 hover:bg-purple-700 shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
