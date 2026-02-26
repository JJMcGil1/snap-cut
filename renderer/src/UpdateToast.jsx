import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, ArrowDownCircle } from 'lucide-react';
import './styles/UpdateToast.css';

// DEV MODE: Set to true to always show the toast for UI development
const DEV_PREVIEW = false;

export default function UpdateToast() {
  const [isOpen, setIsOpen] = useState(DEV_PREVIEW);
  const [status, setStatus] = useState(DEV_PREVIEW ? 'available' : 'idle');
  // status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [error, setError] = useState(null);

  // Listen for update events from main process
  useEffect(() => {
    const api = window.snapcut?.updater;
    if (!api) return;

    // Update available
    const unsubAvailable = api.onUpdateAvailable((result) => {
      console.log('[UpdateToast] Update available:', result);
      setUpdateInfo(result);
      setStatus('available');
      setIsOpen(true);
    });

    // Download progress
    const unsubProgress = api.onDownloadProgress((progress) => {
      console.log('[UpdateToast] Download progress:', progress.percent + '%');
      setDownloadProgress(progress);
    });

    // Update downloaded
    const unsubDownloaded = api.onUpdateDownloaded(() => {
      setStatus('downloaded');
      setDownloadProgress(null);
    });

    // Update error
    const unsubError = api.onUpdateError((info) => {
      setStatus('error');
      setError(info.error);
    });

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && !updateInfo?.updateInfo?.mandatory) {
        setIsOpen(false);
      }
    },
    [updateInfo]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Actions
  const handleDownload = async () => {
    console.log('[UpdateToast] Starting download...');
    setStatus('downloading');
    setError(null);
    try {
      const result = await window.snapcut?.updater?.downloadUpdate();
      console.log('[UpdateToast] Download result:', result);
      if (result && !result.success) {
        setStatus('error');
        setError(result.error || 'Download failed');
      }
    } catch (err) {
      console.error('[UpdateToast] Download error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleInstall = async () => {
    setStatus('installing');
    try {
      await window.snapcut?.updater?.installUpdate();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Installation failed');
    }
  };

  const handleLater = () => {
    if (!updateInfo?.updateInfo?.mandatory) {
      setIsOpen(false);
      window.snapcut?.updater?.dismissUpdate();
    }
  };

  const handleRetry = () => {
    setError(null);
    setStatus('available');
  };

  if (!isOpen) return null;

  const info = updateInfo?.updateInfo;
  const version = info?.version || updateInfo?.latestVersion || (DEV_PREVIEW ? '1.1.0' : '');

  return createPortal(
    <div className="update-toast" role="dialog" aria-label="Update available">
      {/* Main row with icon, title, and actions */}
      <div className="update-toast__row">
        <div className="update-toast__icon">
          <ArrowDownCircle size={18} />
        </div>
        <div className="update-toast__title-group">
          <span className="update-toast__title">Update Available</span>
          <span className="update-toast__version">v{version}</span>
        </div>

        {/* Action buttons inline */}
        <div className="update-toast__actions">
          {status === 'available' && (
            <>
              {!info?.mandatory && (
                <button className="update-toast__btn update-toast__btn--ghost" onClick={handleLater}>
                  Later
                </button>
              )}
              <button className="update-toast__btn update-toast__btn--primary" onClick={handleDownload}>
                Download
              </button>
            </>
          )}

          {status === 'downloading' && (
            <button className="update-toast__btn update-toast__btn--ghost" disabled>
              <RefreshCw size={14} className="update-toast__spinner" />
              {downloadProgress ? `${Math.round(downloadProgress.percent)}%` : 'Starting...'}
            </button>
          )}

          {status === 'downloaded' && (
            <>
              <button className="update-toast__btn update-toast__btn--ghost" onClick={handleLater}>
                Later
              </button>
              <button className="update-toast__btn update-toast__btn--primary" onClick={handleInstall}>
                Install
              </button>
            </>
          )}

          {status === 'installing' && (
            <button className="update-toast__btn update-toast__btn--ghost" disabled>
              <RefreshCw size={14} className="update-toast__spinner" />
              Installing...
            </button>
          )}

          {status === 'error' && (
            <>
              <button className="update-toast__btn update-toast__btn--ghost" onClick={handleLater}>
                Later
              </button>
              <button className="update-toast__btn update-toast__btn--primary" onClick={handleRetry}>
                Retry
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar - only show when downloading */}
      {status === 'downloading' && (
        <div className="update-toast__progress">
          <div
            className="update-toast__progress-fill"
            style={{ width: `${downloadProgress?.percent || 0}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {status === 'error' && error && (
        <div className="update-toast__error">{error}</div>
      )}
    </div>,
    document.body
  );
}
