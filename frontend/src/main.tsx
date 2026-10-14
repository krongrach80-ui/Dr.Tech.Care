import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

window.addEventListener('error', (event) => {
  console.error('[StrongCare Error]:', event.error || event.message);
  displayErrorOverlay((event.error?.stack || event.message || 'Unknown window error'));
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[StrongCare Unhandled Rejection]:', event.reason);
  displayErrorOverlay(String(event.reason?.stack || event.reason || 'Unhandled Promise Rejection'));
});

function displayErrorOverlay(msg: string) {
  if (import.meta.env.DEV) {
    let errBox = document.getElementById('debug-error-box');
    if (!errBox) {
      errBox = document.createElement('div');
      errBox.id = 'debug-error-box';
      errBox.style.cssText =
        'position:fixed;bottom:20px;left:20px;right:20px;max-height:350px;overflow:auto;background:#fff1f2;border:2px solid #e11d48;color:#881337;padding:16px;border-radius:16px;z-index:99999;font-family:monospace;font-size:12px;white-space:pre-wrap;box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);';
      document.body.appendChild(errBox);
    }
    errBox.textContent = `⚠️ StrongCare Runtime Error (DEV):\n\n${msg}\n\n[คลิกเพื่อปิดกล่องข้อผิดพลาดนี้]`;
    errBox.onclick = () => errBox?.remove();
  } else {
    // ใน Production แสดงข้อความภาษาไทยสั้นๆ ด้วย textContent เพื่อความปลอดภัยและสวยงาม
    let prodToast = document.getElementById('prod-error-toast');
    if (!prodToast) {
      prodToast = document.createElement('div');
      prodToast.id = 'prod-error-toast';
      prodToast.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f8fafc;padding:12px 24px;border-radius:9999px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);cursor:pointer;';
      document.body.appendChild(prodToast);
    }
    prodToast.textContent = 'เกิดข้อผิดพลาดในการทำงานของระบบ กรุณารีเฟรชหน้าจอ';
    prodToast.onclick = () => prodToast?.remove();
    setTimeout(() => {
      prodToast?.remove();
    }, 6000);
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
    displayErrorOverlay(String(error.stack || error.message) + '\n\nComponent Stack:\n' + errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F0FAF4] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-emerald-100 p-8 space-y-5 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-3xl font-bold">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              เกิดข้อผิดพลาดในการแสดงผล
            </h2>
            <p className="text-sm text-slate-600">
              {import.meta.env.DEV
                ? (this.state.error?.message || 'ข้อผิดพลาดระบบ')
                : 'ระบบพบปัญหาขัดข้องชั่วคราว กรุณารีเฟรชเพื่อเข้าใช้งานใหม่อีกครั้ง'}
            </p>
            {import.meta.env.DEV && this.state.error?.stack && (
              <pre className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-900 text-xs overflow-auto max-h-40 whitespace-pre-wrap font-mono text-left">
                {this.state.error.stack}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-bold rounded-2xl hover:opacity-95 shadow-lg shadow-cyan-500/25 transition active:scale-95 cursor-pointer"
            >
              รีเฟรชหน้าเว็บ (Reload Page)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
} else {
  console.error('Target container #root not found in document');
}
