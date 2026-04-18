import React, { useRef, useEffect, useState } from 'react';
import { AsciiOptions } from '../types';
import { getAsciiChar } from '../utils/asciiConverter';
import { playStartupSound, playScanSound, startAmbientHum, stopAmbientHum } from '../utils/soundEffects';
import { ScanEye, Camera, Download, Loader2, SwitchCamera } from 'lucide-react';

interface AsciiCanvasProps {
  options: AsciiOptions;
  onCapture: (imageData: string) => void;
  mediaFile: File | null;
  isControlExpanded: boolean;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ options, onCapture, mediaFile, isControlExpanded }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null); 
  const prevFrameRef = useRef<Float32Array | null>(null); 
  const animationRef = useRef<number>();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [focusPoint, setFocusPoint] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      stopAmbientHum();
    };

    if (mediaFile) {
        cleanup(); 
        objectUrl = URL.createObjectURL(mediaFile);
        
        if (mediaFile.type.startsWith('video/') && videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.src = objectUrl;
            videoRef.current.loop = true;
            videoRef.current.play().catch(e => console.error("Play error:", e));
            stopAmbientHum(); 
        } else if (mediaFile.type.startsWith('image/') && imageRef.current) {
            imageRef.current.src = objectUrl;
            if (videoRef.current) videoRef.current.pause();
            stopAmbientHum();
        }
        playStartupSound();
    } else {
        const startCamera = async () => {
          // Small delay allows mobile hardware to fully release the previous camera lens
          await new Promise(resolve => setTimeout(resolve, 500));
          try {
            stream = await navigator.mediaDevices.getUserMedia({ 
              video: { 
                width: { ideal: 1920 }, 
                height: { ideal: 1080 }, 
                facingMode: facingMode === 'environment' ? { exact: 'environment' } : 'user'
              } 
            });

            // Try to enable continuous auto-focus if supported
            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities ? track.getCapabilities() : ({} as any);
            const focusModes = (capabilities as any).focusMode;
            if (focusModes && Array.isArray(focusModes) && focusModes.includes('continuous')) {
                try {
                    await track.applyConstraints({
                        advanced: [{ focusMode: 'continuous' } as any]
                    });
                } catch (consoleError) {
                    console.warn("Could not apply continuous focusMode", consoleError);
                }
            }
            
            if (videoRef.current) {
              videoRef.current.src = "";
              videoRef.current.srcObject = stream;
              await videoRef.current.play().catch(e => console.error("Play error:", e));
              playStartupSound();
              startAmbientHum();
            }
          } catch (err) {
            console.error("Error accessing camera:", err);
            setError("Unable to access camera. Please allow permissions.");
          }
        };

        startCamera();
    }

    return cleanup;
  }, [mediaFile, facingMode]);

  // Handle Canvas Resizing
  useEffect(() => {
    const handleResize = () => {
        if (canvasRef.current) {
            const parent = canvasRef.current.parentElement;
            let targetW = parent ? parent.clientWidth : window.innerWidth;
            let targetH = parent ? parent.clientHeight : window.innerHeight;

            if (options.aspectRatio !== 'free') {
                let ratio = 1;
                if (options.aspectRatio === '16:9') ratio = 16 / 9;
                if (options.aspectRatio === '9:16') ratio = 9 / 16;

                if (targetW / targetH > ratio) {
                    targetW = targetH * ratio;
                } else {
                    targetH = targetW / ratio;
                }
            }

            // Fix video encoding crashes by forcing integer EVEN dimensional rendering
            targetW = Math.floor(targetW / 2) * 2;
            targetH = Math.floor(targetH / 2) * 2;

            canvasRef.current.width = targetW;
            canvasRef.current.height = targetH;
            canvasRef.current.style.width = `${targetW}px`;
            canvasRef.current.style.height = `${targetH}px`;
            
            canvasRef.current.style.position = 'absolute';
            canvasRef.current.style.left = '0';
            canvasRef.current.style.right = '0';
            canvasRef.current.style.top = '0';
            canvasRef.current.style.bottom = '0';
            canvasRef.current.style.margin = 'auto';
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [options.aspectRatio]);

  useEffect(() => {
    prevFrameRef.current = null;
  }, [options.fontSize]);

  useEffect(() => {
    const renderLoop = () => {
      const video = videoRef.current;
      const image = imageRef.current;
      const canvas = canvasRef.current;
      const hiddenCanvas = hiddenCanvasRef.current;
      
      if (!canvas || !hiddenCanvas) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      let sourceElement: HTMLVideoElement | HTMLImageElement | null = null;
      if (mediaFile && mediaFile.type.startsWith('image/')) {
        if (!image || !image.complete || image.naturalWidth === 0) {
            animationRef.current = requestAnimationFrame(renderLoop);
            return;
        }
        sourceElement = image;
      } else {
        if (!video || video.readyState < 2) {
            animationRef.current = requestAnimationFrame(renderLoop);
            return;
        }
        sourceElement = video;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

      if (!ctx || !hiddenCtx) {
          animationRef.current = requestAnimationFrame(renderLoop);
          return;
      }

      const charHeight = options.fontSize;
      const charWidth = charHeight * 0.6; 
      
      const cols = Math.floor(canvas.width / charWidth);
      const rows = Math.floor(canvas.height / charHeight);

      if (cols <= 0 || rows <= 0) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      if (hiddenCanvas.width !== cols || hiddenCanvas.height !== rows) {
        hiddenCanvas.width = cols;
        hiddenCanvas.height = rows;
        prevFrameRef.current = null; 
      }

      // Calculate aspect ratio containment
      let sourceWidth = 1;
      let sourceHeight = 1;

      if (sourceElement instanceof HTMLVideoElement) {
        sourceWidth = sourceElement.videoWidth || 1;
        sourceHeight = sourceElement.videoHeight || 1;
      } else if (sourceElement instanceof HTMLImageElement) {
        sourceWidth = sourceElement.naturalWidth || 1;
        sourceHeight = sourceElement.naturalHeight || 1;
      }

      const canvasRatio = canvas.width / canvas.height;
      const sourceRatio = sourceWidth / sourceHeight;
      
      let drawWidth = canvas.width;
      let drawHeight = canvas.height;
      
      if (canvasRatio > sourceRatio) {
         drawWidth = canvas.width;
         drawHeight = drawWidth / sourceRatio;
      } else {
         drawHeight = canvas.height;
         drawWidth = drawHeight * sourceRatio;
      }
      
      const drawX = (canvas.width - drawWidth) / 2;
      const drawY = (canvas.height - drawHeight) / 2;

      if (options.colorMode === 'normal') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        if (!mediaFile && facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(sourceElement, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      hiddenCtx.save();
      hiddenCtx.fillStyle = '#000000';
      hiddenCtx.fillRect(0, 0, cols, rows);

      if (!mediaFile && facingMode === 'user') {
        hiddenCtx.translate(cols, 0);
        hiddenCtx.scale(-1, 1);
      }
      
      const hDrawX = drawX / charWidth;
      const hDrawY = drawY / charHeight;
      const hDrawCols = drawWidth / charWidth;
      const hDrawRows = drawHeight / charHeight;

      hiddenCtx.drawImage(sourceElement, hDrawX, hDrawY, hDrawCols, hDrawRows);
      hiddenCtx.restore();
      
      const frameData = hiddenCtx.getImageData(0, 0, cols, rows);
      const data = frameData.data;

      const pixelCount = data.length;
      
      if (!prevFrameRef.current || prevFrameRef.current.length !== pixelCount) {
        prevFrameRef.current = new Float32Array(pixelCount);
        for(let i=0; i<pixelCount; i++) prevFrameRef.current[i] = data[i];
      }

      const prev = prevFrameRef.current;
      const inertia = (mediaFile && mediaFile.type.startsWith('image/')) ? 0.0 : 0.75; 

      for (let i = 0; i < pixelCount; i++) {
        const target = data[i];
        const current = prev[i];
        const newValue = current + (target - current) * (1 - inertia);
        
        prev[i] = newValue;
        data[i] = newValue; 
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${options.fontSize}px 'JetBrains Mono', monospace`;
      ctx.textBaseline = 'top';

      const contrastFactor = (259 * (options.contrast * 255 + 255)) / (255 * (259 - options.contrast * 255));

      if (options.colorMode === 'color') {
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const offset = (y * cols + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                
                let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                brightness = contrastFactor * (brightness - 128) + 128;
                brightness *= options.brightness;
                brightness = Math.max(0, Math.min(255, brightness));

                const char = getAsciiChar(brightness, options.density);
                
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillText(char, x * charWidth, y * charHeight);
            }
          }
      } else {
          if (options.colorMode === 'matrix') ctx.fillStyle = '#00ff41';
          else if (options.colorMode === 'retro') ctx.fillStyle = '#ffb000';
          else ctx.fillStyle = '#ffffff';

          for (let y = 0; y < rows; y++) {
            let rowText = "";
            for (let x = 0; x < cols; x++) {
                const offset = (y * cols + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                
                let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                brightness = contrastFactor * (brightness - 128) + 128;
                brightness *= options.brightness;
                brightness = Math.max(0, Math.min(255, brightness));

                rowText += getAsciiChar(brightness, options.density);
            }
            ctx.fillText(rowText, 0, y * charHeight);
          }
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    animationRef.current = requestAnimationFrame(renderLoop);

    return () => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
    };
  }, [options, mediaFile, facingMode]);

  const handleCaptureClick = () => {
    if (canvasRef.current && !isProcessing) {
        playScanSound();
        const dataUrl = canvasRef.current.toDataURL('image/png');
        onCapture(dataUrl);
    }
  };

  const handleScreenshotClick = () => {
    if (canvasRef.current) {
      playScanSound();
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `bitmatrix_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleProcessClick = () => {
    if (!canvasRef.current) return;
    
    // If it's an image, just screenshot instantly
    if (mediaFile && mediaFile.type.startsWith('image/')) {
        handleScreenshotClick();
        return;
    }

    // Process Video
    const video = videoRef.current;
    if (!video || isProcessing) return;

    try {
      playScanSound();
      setIsProcessing(true);
      video.pause();
      video.currentTime = 0;
      video.loop = false; // Need the ended event to fire

      // Ensure canvas capture exists
      const canvasStream = (canvasRef.current as any).captureStream(30);
      let finalStream = canvasStream;
      
      try {
          const vid: any = video;
          const videoStream = vid.captureStream ? vid.captureStream() : (vid.mozCaptureStream ? vid.mozCaptureStream() : null);
          if (videoStream) {
              const audioTracks = videoStream.getAudioTracks();
              if (audioTracks.length > 0) {
                  finalStream = new MediaStream([ ...canvasStream.getVideoTracks(), ...audioTracks ]);
              }
          }
      } catch (e) {
          console.warn("Could not capture audio stream", e);
      }

      const options = { mimeType: 'video/webm; codecs=vp9' };
      const supportedType = MediaRecorder.isTypeSupported(options.mimeType) ? options.mimeType : 'video/mp4';
      
      const recorder = new MediaRecorder(finalStream, { mimeType: supportedType });
      recordedChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: supportedType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bitmatrix_render_${Date.now()}.${supportedType === 'video/mp4' ? 'mp4' : 'webm'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Return back to looping preview
        video.loop = true;
        video.play().catch(e => console.error("Resume play failed", e));
      };

      video.onended = () => {
        recorder.stop();
        setIsProcessing(false);
        video.onended = null; // Clean up listener just in case
      };

      recorder.start();
      video.play().catch(e => console.error("Play error during processing:", e));
      
    } catch (err) {
      console.error("Failed to start automated recording process:", err);
      setIsProcessing(false);
    }
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mediaFile || !videoRef.current) return;
    
    // Visual focus indicator
    setFocusPoint({ x: e.clientX, y: e.clientY });
    setTimeout(() => setFocusPoint(null), 1500);

    const stream = videoRef.current.srcObject as MediaStream;
    if (!stream) return;
    
    const track = stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    
    const capabilities = track.getCapabilities() as any;
    if (capabilities.pointsOfInterest) {
        const rect = e.currentTarget.getBoundingClientRect();
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;
        
        // Front camera mirrors X naturally, so invert
        if (facingMode === 'user') x = 1 - x;
        
        try {
            await track.applyConstraints({
                advanced: [{ pointsOfInterest: [{ x, y }] } as any]
            });
        } catch (err) {
            console.warn("Focus pointsOfInterest failed:", err);
        }
    }
  };

  return (
    <div className="relative w-full h-full bg-black">
        {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-red-500 z-50">
                <p>{error}</p>
            </div>
        )}
        
        {/* Processing Indicator Overlay */}
        {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 text-green-500 font-mono">
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <p className="text-xl tracking-widest uppercase animate-pulse">Processing Video...</p>
                <p className="text-sm mt-2 text-green-700">Please wait while the automated extraction completes.</p>
            </div>
        )}

        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 opacity-0 pointer-events-none -z-10 w-1 h-1" 
            playsInline 
            autoPlay 
            muted={!mediaFile} // Ensure audio plays during video preview and processing
        />
        <img 
            ref={imageRef} 
            className="absolute top-0 left-0 opacity-0 pointer-events-none -z-10 w-1 h-1" 
            alt="Source"
        />
        <canvas ref={hiddenCanvasRef} className="hidden" />
        <canvas 
            ref={canvasRef} 
            className="block cursor-crosshair touch-none" 
            onClick={handleCanvasClick}
        />
        
        {/* Focus Indicator */}
        {focusPoint && (
            <div 
                className="absolute border border-green-400 pointer-events-none z-[60] w-16 h-16 -translate-x-1/2 -translate-y-1/2 animate-[pulse_1.5s_ease-out] shadow-[0_0_10px_rgba(0,255,0,0.5)] bg-green-500/10"
                style={{ left: focusPoint.x, top: focusPoint.y }}
            >
                {/* Corner brackets for aesthetic */}
                <span className="absolute top-0 left-0 border-t-2 border-l-2 border-green-400 w-2 h-2" />
                <span className="absolute top-0 right-0 border-t-2 border-r-2 border-green-400 w-2 h-2" />
                <span className="absolute bottom-0 left-0 border-b-2 border-l-2 border-green-400 w-2 h-2" />
                <span className="absolute bottom-0 right-0 border-b-2 border-r-2 border-green-400 w-2 h-2" />
            </div>
        )}
        
        {/* Floating Controls Container */}
        <div className={`absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4 md:gap-6 z-40 w-full justify-center transition-all duration-300 ${isControlExpanded ? 'bottom-[330px] md:bottom-32' : 'bottom-20 md:bottom-32'}`}>
            
            {/* If uploaded media is active, show Unified Process Button */}
            {mediaFile && (
               <button 
                  onClick={handleProcessClick}
                  disabled={isProcessing}
                  className="bg-green-600/80 hover:bg-green-500 border border-green-400 text-black p-4 px-8 rounded-full shadow-[0_0_20px_rgba(0,255,0,0.5)] transition-all active:scale-95 hover:scale-105 flex items-center gap-3 uppercase font-bold tracking-wider"
                  title="Process & Download"
               >
                  <Download className="w-5 h-5" />
                  <span>{mediaFile.type.startsWith('video/') ? "Render Video" : "Download Image"}</span>
               </button>
            )}

            {/* Scan & Analyze Button (Primary) - Only show if not processing */}
            {!isProcessing && (
              <button 
                  onClick={handleCaptureClick}
                  className="bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500/50 p-6 rounded-full backdrop-blur-md transition-all active:scale-95 group relative hover:shadow-[0_0_25px_rgba(0,255,0,0.5)]"
                  title="Scan & Analyze"
              >
                  <div className="absolute inset-0 rounded-full border border-green-500 opacity-50 animate-ping"></div>
                  <ScanEye className="w-8 h-8" />
              </button>
            )}

            {/* Snapshot fallback for Camera Mode */}
            {!mediaFile && (
              <>
                <button 
                    onClick={handleScreenshotClick}
                    className="bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                    title="Save Snapshot"
                >
                    <Camera className="w-6 h-6" />
                </button>

                {/* Switch Camera for Mobile */}
                <button 
                    onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                    className="md:hidden bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                    title="Switch Camera"
                >
                    <SwitchCamera className="w-6 h-6" />
                </button>
              </>
            )}
        </div>
    </div>
  );
};