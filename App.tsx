
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layers, Wand2, RefreshCw, ClipboardType, ClipboardList } from 'lucide-react';
import { ICONS, DEFAULT_TEMPLATES, VARIABLE_HELP } from './constants';
import { AuthConfig, HistoryItem, WSMessage, MessageTemplate, ScheduleConfig } from './types';
import { processVariables, formatJSON, isJSON } from './utils/variableProcessor';
import { JSONHighlighter } from './components/JSONHighlighter';

const safeBtoa = (str: string) => {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => 
      String.fromCharCode(parseInt(p1, 16))
    ));
  } catch (e) {
    return btoa(str);
  }
};

// Custom Switch Component for better aesthetics
const ToggleSwitch: React.FC<{ 
  label: string, 
  checked: boolean, 
  onChange: (val: boolean) => void,
  color?: string 
}> = ({ label, checked, onChange, color = 'bg-indigo-600' }) => (
  <button 
    onClick={() => onChange(!checked)}
    className="flex items-center gap-2 group outline-none"
  >
    <div className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${checked ? color : 'bg-slate-700'}`}>
      <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
    <span className="text-[10px] text-slate-400 group-hover:text-slate-200 font-bold uppercase tracking-wider select-none">
      {label}
    </span>
  </button>
);

const App: React.FC = () => {
  const [url, setUrl] = useState('wss://ws.postman-echo.com/raw');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [auth, setAuth] = useState<AuthConfig>({ type: 'none' });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // Fix: Added 'warning' to status message type
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' | 'warning' } | null>(null);
  
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [msgType, setMsgType] = useState<'text' | 'json'>('json');
  
  const [filterText, setFilterText] = useState('');
  const [useRegexFilter, setUseRegexFilter] = useState(false);
  const [autoFormatJSON, setAutoFormatJSON] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(false);
  
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES);
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    enabled: false,
    interval: 5000,
    message: '',
    type: 'json'
  });

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scheduleIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  
  // Fix: Added 'warning' to showStatus type definition
  const showStatus = (text: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('ws_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    const savedTemplates = localStorage.getItem('ws_templates');
    if (savedTemplates) {
      const parsed = JSON.parse(savedTemplates);
      if (parsed.length > 0) setTemplates(parsed);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (scheduleIntervalRef.current) clearInterval(scheduleIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ws_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('ws_templates', JSON.stringify(templates));
  }, [templates]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connect = useCallback(() => {
    if (!url.trim()) return showStatus('请输入连接地址', 'error');
    
    try {
      setIsConnecting(true);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }

      let finalUrl = url.trim();
      if (auth.type === 'bearer' && auth.token) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(auth.token)}`;
      } else if (auth.type === 'basic' && auth.username && auth.password) {
        const credentials = safeBtoa(`${auth.username}:${auth.password}`);
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `auth=${credentials}`;
      }

      const ws = new WebSocket(finalUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        showStatus('连接成功', 'success');
        addMessage({
          id: Math.random().toString(),
          timestamp: Date.now(),
          direction: 'received',
          content: 'Session Started: Connected to ' + url,
          type: 'text'
        });

        const newHistory: HistoryItem = {
          id: Date.now().toString(),
          url,
          name: url.split('/')[2] || 'Unnamed',
          auth: { ...auth },
          lastConnected: Date.now()
        };
        setHistory(prev => [newHistory, ...prev.filter(h => h.url !== url)].slice(0, 20));
      };

      ws.onmessage = (event) => {
        const content = event.data;
        addMessage({
          id: Math.random().toString(),
          timestamp: Date.now(),
          direction: 'received',
          content,
          type: isJSON(content) ? 'json' : 'text'
        });
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);
        stopSchedule();
        
        const closeMsg = `连接断开 (代码: ${event.code}${event.reason ? `, 原因: ${event.reason}` : ''})`;
        showStatus('连接已断开', 'info');
        addMessage({
          id: Math.random().toString(),
          timestamp: Date.now(),
          direction: 'received',
          content: closeMsg,
          type: 'text',
          isError: true
        });
        wsRef.current = null;

        // Auto-reconnect logic
        if (autoReconnect) {
          showStatus('准备尝试重新连接...', 'info');
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, 5000);
        }
      };

      ws.onerror = (error) => {
        setIsConnecting(false);
        showStatus('连接异常', 'error');
      };
    } catch (e) {
      setIsConnecting(false);
      showStatus('初始化连接失败', 'error');
    }
  }, [url, auth, autoReconnect]);

  const disconnect = () => {
    stopSchedule();
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  const addMessage = (msg: WSMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const sendMessage = useCallback((overrideText?: string, overrideType?: 'text' | 'json') => {
    const rawContent = overrideText ?? inputText;
    const finalType = overrideType ?? msgType;
    
    if (!rawContent || !rawContent.trim()) {
      if (!overrideText) showStatus('内容不能为空', 'error');
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) {
      showStatus('未连接，无法发送', 'error');
      setIsConnected(false);
      return;
    }

    try {
      const processedContent = processVariables(rawContent);
      ws.send(processedContent);
      addMessage({
        id: Math.random().toString(),
        timestamp: Date.now(),
        direction: 'sent',
        content: processedContent,
        type: finalType
      });
      if (!overrideText) setInputText('');
    } catch (err) {
      showStatus('发送失败', 'error');
    }
  }, [inputText, msgType]);

  const addTemplate = () => {
    if (!inputText.trim()) return showStatus('请先输入模板内容', 'warning');
    const name = window.prompt('请输入模板名称:');
    if (name === null) return; // Cancelled
    if (!name.trim()) return showStatus('模板名称不能为空', 'error');
    
    const newTpl: MessageTemplate = {
      id: Date.now().toString(),
      name: name.trim(),
      content: inputText,
      type: msgType
    };
    
    setTemplates(prev => [...prev, newTpl]);
    showStatus('模板保存成功', 'success');
  };

  const toggleMessageFormat = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, forceFormat: !m.forceFormat } : m));
  };

  const copyToClipboard = (text: string, formatted: boolean = false) => {
    const finalVal = formatted && isJSON(text) ? formatJSON(text) : text;
    navigator.clipboard.writeText(finalVal);
    showStatus(formatted ? '已复制格式化数据' : '已复制原始数据', 'success');
  };

  const startSchedule = () => {
    if (!schedule.message.trim()) return showStatus('请输入定时内容', 'error');
    if (!isConnected) return showStatus('未处于连接状态', 'error');
    setSchedule(prev => ({ ...prev, enabled: true }));
    showStatus('定时任务已开启', 'success');
    if (scheduleIntervalRef.current) clearInterval(scheduleIntervalRef.current);
    scheduleIntervalRef.current = window.setInterval(() => sendMessage(schedule.message, schedule.type), schedule.interval);
  };

  const stopSchedule = () => {
    if (scheduleIntervalRef.current) clearInterval(scheduleIntervalRef.current);
    scheduleIntervalRef.current = null;
    setSchedule(prev => ({ ...prev, enabled: false }));
  };

  const filteredMessages = messages.filter(m => {
    if (!filterText) return true;
    if (useRegexFilter) {
      try {
        return new RegExp(filterText, 'i').test(m.content);
      } catch (e) { return m.content.toLowerCase().includes(filterText.toLowerCase()); }
    }
    return m.content.toLowerCase().includes(filterText.toLowerCase());
  });

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">
      {/* Sidebar */}
      <aside className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-400">
            <Layers size={20} /> WS Pro
          </h1>
          {statusMessage && (
            <div className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
              statusMessage.type === 'error' ? 'bg-rose-900/30 border-rose-500 text-rose-400' :
              statusMessage.type === 'success' ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400' :
              statusMessage.type === 'warning' ? 'bg-amber-900/30 border-amber-500 text-amber-400' :
              'bg-blue-900/30 border-blue-500 text-blue-400'
            }`}>
              {statusMessage.text}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8 text-sm">
          {/* History Section */}
          <section>
            <div className="flex items-center justify-between mb-3 text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                {ICONS.History} 最近连接
              </span>
            </div>
            <div className="space-y-1">
              {history.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setUrl(item.url); setAuth(item.auth); }}
                  className="w-full text-left p-2.5 rounded hover:bg-slate-800 transition text-xs group flex items-center justify-between border border-transparent hover:border-slate-700"
                >
                  <span className="truncate flex-1 font-medium">{item.url}</span>
                  <span className="opacity-0 group-hover:opacity-100 text-rose-500" onClick={(e) => { e.stopPropagation(); setHistory(h => h.filter(x => x.id !== item.id)); }}>{ICONS.Trash}</span>
                </button>
              ))}
              {history.length === 0 && <p className="text-[10px] text-slate-600 italic px-2">暂无历史记录</p>}
            </div>
          </section>

          {/* Variables Info */}
          <section className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/50">
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block flex items-center gap-1">
              {ICONS.Variable} 可用变量
            </span>
            <div className="space-y-2">
              {VARIABLE_HELP.map(v => (
                <div key={v.key} className="text-[11px] flex flex-col gap-0.5">
                  <code className="text-indigo-400 font-bold bg-indigo-900/20 rounded px-1 w-fit">{v.key}</code>
                  <p className="text-slate-500">{v.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Templates Section - Now at bottom */}
          <section className="mt-auto pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3 text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                {ICONS.Templates} 消息模板
              </span>
              <button onClick={addTemplate} className="hover:text-indigo-400 p-1 bg-slate-800 rounded">{ICONS.Plus}</button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="group relative">
                  <button
                    onClick={() => { setInputText(tpl.content); setMsgType(tpl.type); }}
                    className="w-full text-left p-2.5 rounded bg-slate-800/30 hover:bg-slate-800 transition text-[11px] flex items-center justify-between border border-slate-800"
                  >
                    <span className="truncate font-medium">{tpl.name}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{tpl.type}</span>
                  </button>
                  <button 
                    onClick={() => setTemplates(t => t.filter(x => x.id !== tpl.id))}
                    className="absolute right-0 top-0 mt-2 mr-2 opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500"
                  >
                    {ICONS.Trash}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="p-4 bg-slate-900 border-b border-slate-800">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="wss://..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              />
              <button
                onClick={isConnected ? disconnect : connect}
                disabled={isConnecting}
                className={`px-6 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  isConnected 
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg' 
                    : isConnecting 
                      ? 'bg-slate-700 text-slate-400'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/30'
                }`}
              >
                {isConnecting ? '连接中...' : isConnected ? <>{ICONS.Stop} 断开</> : <>{ICONS.Play} 连接</>}
              </button>
            </div>
            
            <div className="flex gap-2 items-center bg-slate-800/50 p-1 rounded-lg border border-slate-800">
              <select 
                value={auth.type}
                onChange={(e) => setAuth({ ...auth, type: e.target.value as any })}
                className="bg-transparent text-xs outline-none px-2 py-1.5 font-bold text-indigo-400"
              >
                <option value="none">无认证</option>
                <option value="bearer">Bearer</option>
                <option value="basic">Basic</option>
              </select>

              {auth.type !== 'none' && (
                <div className="h-4 w-px bg-slate-700 mx-1" />
              )}

              {auth.type === 'bearer' && (
                <input
                  type="password"
                  value={auth.token || ''}
                  onChange={(e) => setAuth({ ...auth, token: e.target.value })}
                  placeholder="Token"
                  className="w-32 bg-transparent text-xs focus:outline-none px-2"
                />
              )}

              {auth.type === 'basic' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={auth.username || ''}
                    onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                    placeholder="User"
                    className="w-20 bg-transparent text-xs focus:outline-none px-1"
                  />
                  <input
                    type="password"
                    value={auth.password || ''}
                    onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                    placeholder="Pass"
                    className="w-20 bg-transparent text-xs focus:outline-none px-1"
                  />
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Message Controls Panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
          <div className="px-4 py-3 border-b border-slate-900 bg-slate-900/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6 flex-1 min-w-[300px]">
              <div className="relative flex-1 max-w-sm">
                <span className="absolute left-3 top-2 text-slate-500">{ICONS.Search}</span>
                <input
                  type="text"
                  placeholder={useRegexFilter ? "正则匹配模式..." : "文本过滤关键词..."}
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-full pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              
              <div className="flex items-center gap-5 border-l border-slate-800 pl-6">
                <ToggleSwitch label="Regex" checked={useRegexFilter} onChange={setUseRegexFilter} color="bg-amber-600" />
                <ToggleSwitch label="Format JSON" checked={autoFormatJSON} onChange={setAutoFormatJSON} color="bg-emerald-600" />
                <ToggleSwitch label="Auto Reconnect" checked={autoReconnect} onChange={setAutoReconnect} color="bg-indigo-600" />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-black text-slate-400 tracking-tighter">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
              </div>
              <button onClick={() => setMessages([])} className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors" title="清空记录">
                {ICONS.Trash}
              </button>
            </div>
          </div>

          {/* Messages Log */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
            {filteredMessages.map((msg) => {
              const shouldFormat = (autoFormatJSON || msg.forceFormat) && isJSON(msg.content);
              return (
                <div key={msg.id} className={`flex flex-col ${msg.direction === 'sent' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[90%] group relative`}>
                    <div className={`flex items-center gap-2 mb-1.5 px-1 ${msg.direction === 'sent' ? 'justify-end' : ''}`}>
                      <span className="text-[9px] text-slate-500 font-bold font-mono">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 rounded ${msg.direction === 'sent' ? 'bg-indigo-900/30 text-indigo-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                        {msg.direction === 'sent' ? 'Outbound' : 'Inbound'}
                      </span>
                    </div>
                    
                    <div className={`
                      p-3 rounded-xl border shadow-sm transition-all duration-300 relative
                      ${msg.direction === 'sent' 
                        ? 'bg-indigo-900/10 border-indigo-500/30 text-indigo-100' 
                        : msg.isError 
                          ? 'bg-rose-900/10 border-rose-500/30 text-rose-200' 
                          : 'bg-slate-900/40 border-slate-800 text-slate-200'
                      }
                    `}>
                      {shouldFormat ? (
                        <JSONHighlighter content={formatJSON(msg.content)} />
                      ) : (
                        <div className="text-[13px] code-font whitespace-pre-wrap break-words">{msg.content}</div>
                      )}

                      {/* Message Actions */}
                      <div className="absolute -top-3 -right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isJSON(msg.content) && (
                          <button 
                            onClick={() => toggleMessageFormat(msg.id)}
                            className={`p-1.5 rounded-full border shadow-xl transition-colors ${msg.forceFormat ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-indigo-400 hover:bg-slate-700'}`}
                            title="单独切换格式化"
                          >
                            <Wand2 size={12} />
                          </button>
                        )}
                        
                        <div className="flex bg-slate-800 border border-slate-700 rounded-full overflow-hidden shadow-xl">
                          <button 
                            onClick={() => copyToClipboard(msg.content, false)}
                            className="p-1.5 hover:bg-slate-700 text-slate-300 transition-colors border-r border-slate-700"
                            title="复制 Raw"
                          >
                            <ClipboardType size={12} />
                          </button>
                          {isJSON(msg.content) && (
                            <button 
                              onClick={() => copyToClipboard(msg.content, true)}
                              className="p-1.5 hover:bg-slate-700 text-emerald-400 transition-colors"
                              title="复制 Pretty"
                            >
                              <ClipboardList size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-40">
                <Layers size={64} className="mb-4 stroke-1" />
                <p className="text-sm font-medium tracking-tight uppercase">Ready to monitor traffic</p>
              </div>
            )}
          </div>
        </div>

        {/* Composer Footer */}
        <footer className="p-4 bg-slate-900 border-t border-slate-800 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex gap-6 max-w-7xl mx-auto">
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                  <button 
                    onClick={() => setMsgType('text')}
                    className={`px-4 py-1.5 text-[10px] rounded-md transition-all font-bold tracking-widest ${msgType === 'text' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    TEXT
                  </button>
                  <button 
                    onClick={() => setMsgType('json')}
                    className={`px-4 py-1.5 text-[10px] rounded-md transition-all font-bold tracking-widest ${msgType === 'json' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    JSON
                  </button>
                </div>
                {msgType === 'json' && (
                  <button 
                    onClick={() => { setInputText(formatJSON(inputText)); }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 px-3 py-1 bg-indigo-900/20 rounded-full border border-indigo-900/50"
                  >
                    {ICONS.JSON} PRETTIFY
                  </button>
                )}
              </div>
              
              <div className="relative group">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage();
                  }}
                  placeholder={msgType === 'json' ? '{ "action": "ping" }' : 'Compose message...'}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-[13px] code-font focus:outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder-slate-600 transition-all resize-none shadow-inner"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!isConnected}
                  className={`absolute bottom-4 right-4 p-4 rounded-2xl shadow-2xl transition-all transform active:scale-95 flex items-center justify-center ${
                    isConnected 
                      ? 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105 text-white' 
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  {ICONS.Send}
                </button>
              </div>
            </div>

            <div className="w-80 bg-slate-800/20 p-4 rounded-2xl border border-slate-800 flex flex-col gap-5">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 mb-4 tracking-tighter">
                  {ICONS.Clock} Automatic Sequences
                </span>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={schedule.interval}
                      onChange={(e) => setSchedule({ ...schedule, interval: Math.max(50, Number(e.target.value)) })}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-indigo-400 font-black focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] font-bold text-slate-500">MS INTERVAL</span>
                  </div>
                  
                  <textarea 
                    placeholder="Message to loop..."
                    value={schedule.message}
                    onChange={(e) => setSchedule({ ...schedule, message: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs h-24 code-font focus:ring-1 focus:ring-emerald-500 focus:outline-none placeholder-slate-700"
                  />

                  <button
                    onClick={schedule.enabled ? stopSchedule : startSchedule}
                    disabled={!isConnected}
                    className={`w-full py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 border shadow-xl ${
                      schedule.enabled 
                        ? 'bg-rose-900/40 text-rose-400 border-rose-500/50 hover:bg-rose-900/60' 
                        : isConnected
                          ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-900/60'
                          : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {schedule.enabled ? <>{ICONS.Stop} STOP LOOP</> : <>{ICONS.Play} START SEQUENCE</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
