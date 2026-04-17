import React, { useRef } from 'react';
import { AsciiOptions, DENSITY_MAPS } from '../types';
import { Sliders, Monitor, Type, Palette, Upload, Crop, ChevronUp, ChevronDown } from 'lucide-react';
import { playButtonSound } from '../utils/soundEffects';

interface ControlPanelProps {
  options: AsciiOptions;
  setOptions: React.Dispatch<React.SetStateAction<AsciiOptions>>;
  setMediaFile: (file: File | null) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ options, setOptions, setMediaFile, isExpanded, setIsExpanded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMediaFile(e.target.files[0]);
    }
  };

  const handleChange = (key: keyof AsciiOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleModeChange = (key: keyof AsciiOptions, value: any) => {
      playButtonSound();
      handleChange(key, value);
  }

  return (
    <div className={`absolute bottom-0 w-full bg-black/80 border-t border-green-900/50 backdrop-blur-sm z-30 transition-all duration-300 ${isExpanded ? 'p-4' : 'p-0 md:p-4'}`}>
      <button 
        onClick={() => { playButtonSound(); setIsExpanded(!isExpanded); }} 
        className="w-full flex justify-center items-center py-2 md:hidden border-b border-green-900/30 text-green-500 bg-black/50 hover:bg-green-900/40 transition-colors"
      >
        <span className="text-[10px] uppercase tracking-widest mr-2 font-mono">{isExpanded ? 'Hide Controls' : 'Show Controls'}</span>
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
      <div className={`max-w-6xl mx-auto gap-6 justify-center items-center text-green-500 text-xs font-mono ${isExpanded ? 'flex flex-wrap pt-4 md:pt-0' : 'hidden md:flex md:flex-wrap'}`}>
        
        {/* Upload Media */}
        <div className="flex flex-col gap-1 w-32 justify-center">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*,video/*" 
            className="hidden" 
          />
          <button 
            onClick={() => { playButtonSound(); fileInputRef.current?.click(); }}
            className="flex items-center justify-center gap-2 px-2 py-1.5 border border-green-800 text-green-700 hover:text-black hover:bg-green-500 hover:border-green-500 transition-colors uppercase font-bold"
            title="Upload Image/Video"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>
        </div>

        {/* Font Size */}
        <div className="flex flex-col gap-1 w-32">
          <div className="flex items-center gap-2 mb-1">
             <Type className="w-3 h-3" />
             <label>FONT SIZE: {options.fontSize}px</label>
          </div>
          <input 
            type="range" 
            min="6" 
            max="24" 
            value={options.fontSize} 
            onChange={(e) => handleChange('fontSize', Number(e.target.value))}
            className="accent-green-500 h-1 bg-green-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Brightness */}
        <div className="flex flex-col gap-1 w-32">
           <div className="flex items-center gap-2 mb-1">
             <Sliders className="w-3 h-3" />
             <label>GAIN: {options.brightness.toFixed(1)}</label>
           </div>
          <input 
            type="range" 
            min="0.5" 
            max="2.0" 
            step="0.1" 
            value={options.brightness} 
            onChange={(e) => handleChange('brightness', Number(e.target.value))}
            className="accent-green-500 h-1 bg-green-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Contrast */}
        <div className="flex flex-col gap-1 w-32">
           <div className="flex items-center gap-2 mb-1">
             <Monitor className="w-3 h-3" />
             <label>CONTRAST: {options.contrast.toFixed(1)}</label>
           </div>
          <input 
            type="range" 
            min="0.5" 
            max="3.0" 
            step="0.1" 
            value={options.contrast} 
            onChange={(e) => handleChange('contrast', Number(e.target.value))}
            className="accent-green-500 h-1 bg-green-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Color Mode */}
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Palette className="w-3 h-3" />
                <span>MODE</span>
            </div>
            <div className="flex gap-1">
                {(['normal', 'matrix', 'bw', 'retro', 'color'] as const).map(mode => (
                    <button
                        key={mode}
                        onClick={() => handleModeChange('colorMode', mode)}
                        className={`px-2 py-1 border ${options.colorMode === mode ? 'bg-green-500 text-black border-green-500' : 'bg-transparent border-green-800 text-green-700 hover:border-green-500'} text-[10px] uppercase transition-colors`}
                    >
                        {mode}
                    </button>
                ))}
            </div>
        </div>

        {/* Aspect Ratio */}
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Crop className="w-3 h-3" />
                <span>RATIO</span>
            </div>
            <div className="flex gap-1">
                {(['free', '16:9', '9:16', '1:1'] as const).map(ratio => (
                    <button
                        key={ratio}
                        onClick={() => handleModeChange('aspectRatio', ratio)}
                        className={`px-2 py-1 border ${options.aspectRatio === ratio ? 'bg-green-500 text-black border-green-500' : 'bg-transparent border-green-800 text-green-700 hover:border-green-500'} text-[10px] uppercase transition-colors`}
                    >
                        {ratio}
                    </button>
                ))}
            </div>
        </div>

        {/* Density Map */}
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Type className="w-3 h-3" />
                <span>CHARSET</span>
            </div>
            <div className="flex gap-1">
                {(Object.keys(DENSITY_MAPS) as Array<keyof typeof DENSITY_MAPS>).map(mode => (
                    <button
                        key={mode}
                        onClick={() => handleModeChange('density', mode)}
                        className={`px-2 py-1 border ${options.density === mode ? 'bg-green-500 text-black border-green-500' : 'bg-transparent border-green-800 text-green-700 hover:border-green-500'} text-[10px] uppercase transition-colors`}
                    >
                        {mode}
                    </button>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
};