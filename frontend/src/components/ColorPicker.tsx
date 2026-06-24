import { COLOR_MAP, COLOR_CYCLE } from "./BoardGrid";

interface ColorPickerProps {
  selected: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ selected, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-slate-500 uppercase tracking-widest">Color</span>
      <div className="flex flex-wrap gap-2">
        {COLOR_CYCLE.filter((c) => c !== "off").map((color) => (
          <button
            key={color}
            title={color}
            onClick={() => onChange(color)}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${
              selected === color
                ? "border-white scale-110"
                : "border-transparent hover:border-slate-500"
            }`}
            style={{ backgroundColor: COLOR_MAP[color] }}
          />
        ))}
        <button
          title="off / erase"
          onClick={() => onChange("off")}
          className={`w-8 h-8 rounded-full border-2 transition-transform bg-slate-900 ${
            selected === "off"
              ? "border-white scale-110"
              : "border-slate-700 hover:border-slate-500"
          }`}
        >
          <span className="text-slate-500 text-xs">×</span>
        </button>
      </div>
    </div>
  );
}
