
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Layers, 
  Wand2, 
  RefreshCw, 
  ShieldCheck, 
  Zap, 
  Terminal, 
  History as HistoryIcon,
  Plus,
  Trash2,
  Copy,
  Search,
  Check,
  X,
  Play,
  Square,
  Clock,
  Send,
  Save,
  ChevronRight,
  ChevronDown,
  Code2,
  FileJson,
  ClipboardList
} from 'lucide-react';
import { ICONS, DEFAULT_TEMPLATES, VARIABLE_HELP } from './constants';
import { AuthConfig, HistoryItem, WSMessage, MessageTemplate, ScheduleConfig, AuthType } from './types';
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

const ActionButton: React.FC<{ 
  onClick: (e: React.MouseEvent) => void, 
  icon: React.ReactNode, 
  tip: string, 
  color?: string 
}> = ({ onClick, icon, tip, color = "text-slate-400" }) => (
  <div className="relative group/tip flex items-center justify-center">
    <button 
      onClick={onClick}
      className={`p-2 rounded-lg bg-slate-900 border border-slate-700 ${color} hover:text-white transition-all shadow-xl active:scale-90 hover:bg-slate-800`}
    >
      {icon}
    </button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 border border-slate-700 text-[10px] font-bold text-white whitespace-nowrap rounded pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-2xl">
      {tip}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
    </div>
  </div>
);

const CustomAuthSelector: React.FC<{ 
  value: AuthType, 
  onChange: (val: AuthType) => void 
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options: { id: AuthType, label: string }[] = [
    { id: 'none', label: '无认证 (Open)' },
    { id: 'bearer', label: 'Bearer Token' },
    { id: 'basic', label: 'Basic Auth' },
    { id: 'custom-header', label: 'Custom Header' }
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl hover:border-cyan-500/50 transition-all text-xs font-bold text-slate-300 min-w-[140px] justify-between shadow-lg ring-1 ring-white/5"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-cyan-500" />
          <span className="uppercase tracking-wider">
            {options.find(o => o.id === value)?.label.split(' ')[0]}
          </span>
        </div>
        <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl py-2 shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setIsOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors flex items-center justify-between group ${value === opt.id ? 'text-cyan-400 bg-cyan-500/5' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <span>{opt.label}</span>
              {value === opt.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ToggleSwitch: React.FC<{ 
  label: string, 
  checked: boolean, 
  onChange: (val: boolean) => void,
  color?: string 
}> = ({ label, checked, onChange, color = 'bg-cyan-500' }) => (
  <button 
    onClick={() => onChange(!checked)}
    className="flex items-center gap-2 group outline-none"
  >
    <div className={`relative w-8 h-4 rounded-full transition-all duration-300 ${checked ? color : 'bg-slate-800'}`}>
      <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 ${checked ? 'translate-x-4 shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'translate-x-0'}`} />
    </div>
    <span className="text-[10px] text-slate-500 group-hover:text-slate-300 font-bold uppercase tracking-widest select-none">
      {label}
    </span>
  </button>
);

const App: React.FC = () => {
  const [url, setUrl] = useState('wss://ws.postman-echo.com/raw');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [auth, setAuth] = useState<AuthConfig>({ type: 'none', customKey: 'X-Auth-Token' });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' | 'warning' } | null>(null);
  
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [msgType, setMsgType] = useState<'text' | 'json'>('json');
  
  const [filterText, setFilterText] = useState('');
  const [useRegexFilter, setUseRegexFilter] = useState(false);
  const [autoFormatJSON, setAutoFormatJSON] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(false);
  
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTplModal, setShowTplModal] = useState(false);
  const [newTplName, setNewTplName] = useState('');

  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [toolbarX, setToolbarX] = useState(0);

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
  
  const showStatus = (text: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('ws_history_v2');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    const savedTemplates = localStorage.getItem('ws_templates_v2');
    if (savedTemplates) {
      setTemplates(JSON.parse(savedTemplates) as MessageTemplate[]);
    } else {
      setTemplates(DEFAULT_TEMPLATES);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (scheduleIntervalRef.current) clearInterval(scheduleIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ws_history_v2', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('ws_templates_v2', JSON.stringify(templates));
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
    if (!url.trim()) return showStatus('请输入有效的 WebSocket 地址', 'error');
    
    try {
      setIsConnecting(true);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }

      let finalUrl = url.trim();
      const separator = finalUrl.includes('?') ? '&' : '?';

      if (auth.type === 'bearer' && auth.token) {
        finalUrl += `${separator}token=${encodeURIComponent(auth.token)}`;
      } else if (auth.type === 'basic' && auth.username && auth.password) {
        const credentials = safeBtoa(`${auth.username}:${auth.password}`);
        finalUrl += `${separator}auth=${credentials}`;
      } else if (auth.type === 'custom-header' && auth.customKey && auth.customValue) {
        finalUrl += `${separator}${encodeURIComponent(auth.customKey)}=${encodeURIComponent(auth.customValue)}`;
      }

      const ws = new WebSocket(finalUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        showStatus('连接已建立', 'success');
        addMessage({
          id: Math.random().toString(),
          timestamp: Date.now(),
          direction: 'received',
          content: `Connected to ${url} (Protocol: ${ws.protocol || 'Default'})`,
          type: 'text'
        });

        const newHistory: HistoryItem = {
          id: Date.now().toString(),
          url,
          name: url.split('/')[2] || 'Unnamed',
          auth: { ...auth },
          lastConnected: Date.now()
        };
        setHistory(prev => [newHistory, ...prev.filter(h => h.url !== url)].slice(0, 15));
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
        
        const closeMsg = `Session Closed [Code: ${event.code}${event.reason ? `, Reason: ${event.reason}` : ''}]`;
        showStatus('连接断开', 'info');
        addMessage({
          id: Math.random().toString(),
          timestamp: Date.now(),
          direction: 'received',
          content: closeMsg,
          type: 'text',
          isError: true
        });
        wsRef.current = null;

        if (autoReconnect) {
          showStatus('正在尝试自动重连...', 'warning');
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        setIsConnecting(false);
        showStatus('连接握手失败', 'error');
      };
    } catch (e) {
      setIsConnecting(false);
      showStatus('无效的 URL 或协议', 'error');
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
    showStatus('已手动关闭连接', 'info');
  };

  const addMessage = (msg: WSMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const toggleMessageFormatting = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, forceFormat: !m.forceFormat } : m));
  };

  const sendMessage = useCallback((overrideText?: string, overrideType?: 'text' | 'json') => {
    const rawContent = overrideText ?? inputText;
    const finalType = overrideType ?? msgType;
    
    if (!rawContent || !rawContent.trim()) {
      if (!overrideText) showStatus('请输入发送内容', 'warning');
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) {
      showStatus('未连接服务器', 'error');
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
      showStatus('发送数据失败', 'error');
    }
  }, [inputText, msgType]);

  const handleAddTemplate = () => {
    if (!inputText.trim()) return showStatus('请先在输入框填写内容', 'warning');
    setShowTplModal(true);
  };

  const saveTemplate = () => {
    if (!newTplName.trim()) return showStatus('名称不能为空', 'error');
    const newTpl: MessageTemplate = {
      id: Date.now().toString(),
      name: newTplName.trim(),
      content: inputText,
      type: msgType
    };
    setTemplates(prev => [newTpl, ...prev]);
    setNewTplName('');
    setShowTplModal(false);
    showStatus('模板已保存', 'success');
  };

  const startSchedule = () => {
    if (!schedule.message.trim()) return showStatus('任务内容为空', 'error');
    if (!isConnected) return showStatus('离线状态无法开启任务', 'error');
    setSchedule(prev => ({ ...prev, enabled: true }));
    showStatus('循环发送开启', 'success');
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
      } catch (e) { return false; }
    }
    return m.content.toLowerCase().includes(filterText.toLowerCase());
  });

  const handleMessageMouseEnter = (e: React.MouseEvent, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setToolbarX(x);
    setHoveredMsgId(id);
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-300 font-sans selection:bg-cyan-500/30">
      {/* Templates Modal */}
      {showTplModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-96 shadow-2xl shadow-cyan-500/10 scale-in-center">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Save size={20} className="text-cyan-400" /> 保存消息模板
            </h3>
            <input 
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none mb-6 text-white"
              placeholder="模板名称，例如：Auth Request"
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveTemplate()}
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setShowTplModal(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold transition-all"
              >
                取消
              </button>
              <button 
                onClick={saveTemplate}
                className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-all shadow-lg shadow-cyan-900/40"
              >
                保存模板
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Global Status Notification */}
      {statusMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[600] pointer-events-none w-full flex justify-center">
          <div className={`px-6 py-4 rounded-2xl border-2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-3xl animate-in slide-in-from-top-6 duration-700 flex items-center gap-4 ${
            statusMessage.type === 'error' ? 'bg-rose-950/80 border-rose-500/60 text-rose-100 shadow-rose-500/10' :
            statusMessage.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-100 shadow-emerald-500/10' :
            'bg-cyan-950/80 border-cyan-500/60 text-cyan-100 shadow-cyan-500/10'
          }`}>
             <div className="p-2 rounded-xl bg-white/10 ring-1 ring-white/20">
               {statusMessage.type === 'error' ? <X size={20}/> : statusMessage.type === 'success' ? <Check size={20}/> : <Zap size={20}/>}
             </div>
             <span className="text-sm font-black tracking-tight">{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-80 border-r border-slate-900 flex flex-col bg-slate-900/20 backdrop-blur-xl shrink-0">
        <div className="p-6 flex flex-col gap-1 border-b border-slate-900/50">
          <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-lg shadow-lg shadow-cyan-500/20">
              <Terminal size={20} className="text-white" />
            </div>
            WebSocket
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-12">Professional Tester</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-10">
          <section>
            <div className="flex items-center gap-2 mb-4">
              <HistoryIcon size={14} className="text-slate-500" />
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">历史记录</span>
            </div>
            <div className="space-y-2">
              {history.map(item => (
                <div key={item.id} className="group relative">
                  <button
                    onClick={() => { setUrl(item.url); setAuth(item.auth); }}
                    className="w-full text-left p-3 rounded-xl bg-slate-900/40 hover:bg-slate-800 border border-slate-800/50 hover:border-slate-700 transition flex items-center justify-between pr-10"
                  >
                    <div className="truncate flex-1">
                      <p className="text-xs font-bold text-slate-300 truncate">{item.url}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{new Date(item.lastConnected).toLocaleTimeString()}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-700 group-hover:text-cyan-500 transition-colors" />
                  </button>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setHistory(prev => prev.filter(h => h.id !== item.id));
                      showStatus('已删除历史记录', 'info');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 hover:text-rose-500 transition-opacity bg-slate-900/80 rounded-lg shadow-xl"
                    title="Delete History"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {history.length === 0 && <p className="text-[10px] text-slate-700 italic text-center py-4">No recent sessions</p>}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-slate-500" />
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">模板消息</span>
              </div>
              <button 
                onClick={handleAddTemplate}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-cyan-500 transition-colors"
                title="Save Current Message"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="group relative">
                  <button
                    onClick={() => { setInputText(tpl.content); setMsgType(tpl.type); }}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/30 hover:bg-cyan-950/20 border border-slate-800/50 hover:border-cyan-800/50 transition-all flex flex-col gap-1 pr-10"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-slate-300 truncate pr-4">{tpl.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-black tracking-tighter uppercase">{tpl.type}</span>
                    </div>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setTemplates(t => t.filter(x => x.id !== tpl.id)); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 hover:text-rose-500 transition-opacity bg-slate-900 rounded-lg shadow-xl"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50">
             <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-amber-500" />
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">动态变量</span>
            </div>
            <div className="space-y-3">
              {VARIABLE_HELP.map(v => (
                <div key={v.key} className="text-[10px]">
                  <code className="text-amber-400 font-bold bg-amber-950/30 rounded px-1.5 py-0.5 block w-fit mb-1">{v.key}</code>
                  <p className="text-slate-600 font-medium leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
        <header className="p-6 bg-slate-900/20 border-b border-slate-900/80 backdrop-blur-md shrink-0">
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              <div className="flex-1 flex gap-2 relative group items-center">
                <div className="flex-1 flex bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500/30 transition-all">
                  <div className="flex items-center px-4 border-r border-slate-800">
                    <Terminal size={14} className="text-slate-600" />
                  </div>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="wss://endpoint.com/v1"
                    className="flex-1 bg-transparent px-4 py-3 text-sm outline-none font-mono text-cyan-50"
                  />
                </div>
                <button
                  onClick={isConnected ? disconnect : connect}
                  disabled={isConnecting}
                  className={`px-6 py-2.5 h-11 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg self-center whitespace-nowrap ${
                    isConnected 
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-900/20' 
                      : isConnecting 
                        ? 'bg-slate-800 text-slate-500 cursor-wait'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                  }`}
                >
                  {isConnecting ? <RefreshCw className="animate-spin" size={14}/> : isConnected ? <Square size={14}/> : <Play size={14}/>}
                  {isConnecting ? '握手中' : isConnected ? '断开' : '连接'}
                </button>
              </div>

              <div className="flex items-center gap-3 bg-slate-900/30 p-2 rounded-2xl border border-slate-800/50 shadow-inner h-11 self-center">
                <CustomAuthSelector 
                  value={auth.type} 
                  onChange={(val) => setAuth({ ...auth, type: val })} 
                />

                <div className="flex items-center min-h-[40px]">
                  {auth.type === 'bearer' && (
                    <input
                      type="password"
                      value={auth.token || ''}
                      onChange={(e) => setAuth({ ...auth, token: e.target.value })}
                      placeholder="Bearer Token..."
                      className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-48 text-cyan-200"
                    />
                  )}
                  {auth.type === 'basic' && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={auth.username || ''}
                        onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                        placeholder="User"
                        className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-24 text-cyan-200"
                      />
                      <input
                        type="password"
                        value={auth.password || ''}
                        onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                        placeholder="Pass"
                        className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-24 text-cyan-200"
                      />
                    </div>
                  )}
                  {auth.type === 'custom-header' && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={auth.customKey || ''}
                        onChange={(e) => setAuth({ ...auth, customKey: e.target.value })}
                        placeholder="Header Key"
                        className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-28 text-cyan-200"
                      />
                      <input
                        type="text"
                        value={auth.customValue || ''}
                        onChange={(e) => setAuth({ ...auth, customValue: e.target.value })}
                        placeholder="Value"
                        className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-28 text-cyan-200"
                      />
                    </div>
                  )}
                  {auth.type === 'none' && (
                    <span className="text-[10px] text-slate-600 font-bold px-4 uppercase tracking-[0.15em] opacity-60">无需认证</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-8">
                <ToggleSwitch label="自动重连" checked={autoReconnect} onChange={setAutoReconnect} color="bg-indigo-500" />
                <ToggleSwitch label="全局格式化" checked={autoFormatJSON} onChange={setAutoFormatJSON} color="bg-emerald-500" />
                <ToggleSwitch label="正则过滤" checked={useRegexFilter} onChange={setUseRegexFilter} color="bg-amber-500" />
              </div>
              <div className="relative w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  type="text"
                  placeholder="搜索消息内容..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-xs focus:ring-1 focus:ring-cyan-500/50 outline-none placeholder:text-slate-700 shadow-inner"
                />
              </div>
            </div>
          </div>
        </header>

        <div 
          ref={scrollRef} 
          className="flex-1 overflow-y-auto p-6 space-y-12 custom-scrollbar scroll-smooth"
        >
          {filteredMessages.map((msg) => {
            const isJsonMsg = isJSON(msg.content);
            const shouldFormat = (autoFormatJSON || msg.forceFormat) && isJsonMsg;
            const isSent = msg.direction === 'sent';
            
            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isSent ? 'items-end' : 'items-start'} group relative`}
              >
                <div className={`flex items-center gap-3 mb-2 px-2 text-[10px] font-black uppercase tracking-tighter ${isSent ? 'flex-row-reverse text-fuchsia-500' : 'text-cyan-500'}`}>
                  <span>{isSent ? 'Sent' : 'Received'}</span>
                  <div className={`w-1 h-1 rounded-full ${isSent ? 'bg-fuchsia-500' : 'bg-cyan-500'}`} />
                  <span className="text-slate-600 font-mono opacity-80">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>

                <div 
                  className={`relative max-w-[92%] lg:max-w-[85%] p-4 rounded-2xl border transition-all duration-300 shadow-xl ${
                    isSent 
                      ? 'bg-fuchsia-950/5 border-fuchsia-500/10 text-fuchsia-50 group-hover:border-fuchsia-500/30' 
                      : msg.isError 
                        ? 'bg-rose-950/10 border-rose-500/20 text-rose-100' 
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-200 group-hover:border-slate-700 shadow-slate-950/20'
                  }`}
                  onMouseEnter={(e) => handleMessageMouseEnter(e, msg.id)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                >
                  {hoveredMsgId === msg.id && (
                    <div 
                      className="absolute z-[100] flex items-center gap-2 px-2 py-1.5 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-md pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
                      style={{ 
                        top: '-40px', 
                        left: `${toolbarX}px`,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      {isJsonMsg && (
                        <ActionButton 
                          icon={msg.forceFormat ? <Code2 size={13} /> : <FileJson size={13} />} 
                          tip={msg.forceFormat ? "还原原始内容" : "格式化显示"}
                          color="text-emerald-500" 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMessageFormatting(msg.id);
                          }} 
                        />
                      )}
                      
                      <ActionButton 
                        icon={<Copy size={13} />} 
                        tip="复制原始内容" 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(msg.content);
                          showStatus('已复制原始文本', 'success');
                        }} 
                      />

                      {isJsonMsg && (
                        <ActionButton 
                          icon={<ClipboardList size={13} />} 
                          tip="复制 JSON 结果" 
                          color="text-cyan-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(formatJSON(msg.content));
                            showStatus('已复制格式化后的内容', 'success');
                          }} 
                        />
                      )}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-700" />
                    </div>
                  )}

                  {shouldFormat ? (
                    <JSONHighlighter content={formatJSON(msg.content)} />
                  ) : (
                    <div className="text-[13px] font-mono whitespace-pre-wrap break-all leading-relaxed p-1">{msg.content}</div>
                  )}
                </div>
              </div>
            );
          })}
          
          {filteredMessages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-800 opacity-40">
              <div className="p-12 bg-slate-900/30 rounded-full border border-slate-800/50 mb-6">
                <Terminal size={64} className="opacity-20" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.4em]">Listening for traffic...</p>
            </div>
          )}
        </div>

        <footer className="p-6 bg-slate-900/40 border-t border-slate-900 backdrop-blur-2xl shrink-0">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
                  <button 
                    onClick={() => setMsgType('text')}
                    className={`px-5 py-2 text-[10px] rounded-lg transition-all font-black tracking-widest ${msgType === 'text' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
                  >
                    RAW TEXT
                  </button>
                  <button 
                    onClick={() => setMsgType('json')}
                    className={`px-5 py-2 text-[10px] rounded-lg transition-all font-black tracking-widest ${msgType === 'json' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
                  >
                    JSON
                  </button>
                </div>
                {msgType === 'json' && (
                  <button 
                    onClick={() => setInputText(formatJSON(inputText))}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-black flex items-center gap-2 px-3 py-2 bg-emerald-950/30 rounded-xl border border-emerald-800/50 transition-all hover:scale-105"
                  >
                    <Wand2 size={12} /> FORMAT INPUT
                  </button>
                )}
              </div>

              <div className="relative group/input">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage();
                  }}
                  placeholder={msgType === 'json' ? '{ "command": "subscribe", "channel": "updates" }' : 'Type your message... (Ctrl+Enter to send)'}
                  rows={4}
                  className="w-full bg-slate-900/70 border border-slate-800 rounded-2xl p-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all resize-none text-white shadow-2xl scrollbar-hide"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!isConnected}
                  className={`absolute bottom-5 right-5 w-14 h-14 rounded-2xl shadow-2xl transition-all flex items-center justify-center group/send overflow-hidden ${
                    isConnected 
                      ? 'bg-gradient-to-br from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white active:scale-95 shadow-indigo-900/40' 
                      : 'bg-slate-800 text-slate-700 cursor-not-allowed opacity-50'
                  }`}
                >
                  <Send size={24} className={`${isConnected ? 'group-hover/send:translate-x-1 group-hover/send:-translate-y-1 transition-transform' : ''}`} />
                </button>
              </div>
            </div>

            <div className="w-full lg:w-80 bg-slate-900/50 p-5 rounded-2xl border border-slate-800 flex flex-col gap-4 shadow-2xl backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-indigo-400" />
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">自动发送</span>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold text-slate-600 uppercase">Interval</span>
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                    <input
                      type="number"
                      value={schedule.interval}
                      onChange={(e) => setSchedule({ ...schedule, interval: Math.max(10, Number(e.target.value)) })}
                      className="w-16 bg-transparent text-xs text-indigo-400 font-black outline-none"
                    />
                    <span className="text-[9px] text-slate-700 font-bold">MS</span>
                  </div>
                </div>
                
                <textarea 
                  placeholder="Task message payload..."
                  value={schedule.message}
                  onChange={(e) => setSchedule({ ...schedule, message: e.target.value })}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[11px] h-24 font-mono focus:ring-1 focus:ring-indigo-500 outline-none text-indigo-100 placeholder-slate-800 shadow-inner"
                />

                <button
                  onClick={schedule.enabled ? stopSchedule : startSchedule}
                  disabled={!isConnected}
                  className={`w-full py-4 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-3 border shadow-xl ${
                    schedule.enabled 
                      ? 'bg-rose-900/30 text-rose-400 border-rose-500/50 hover:bg-rose-900/50 shadow-rose-950/20' 
                      : isConnected
                        ? 'bg-indigo-900/30 text-indigo-400 border-indigo-500/50 hover:bg-indigo-900/50 shadow-indigo-950/20'
                        : 'bg-slate-800/30 border-slate-800 text-slate-700 cursor-not-allowed opacity-50'
                  }`}
                >
                  {schedule.enabled ? <><Square size={14}/> STOP </> : <><Play size={14}/> STAR</>}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
