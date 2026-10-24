import type { CrowdingDisplay } from '../lib/display';

const colors: Record<CrowdingDisplay['color'], string> = {
  green: 'bg-[#d8f0dc]',
  amber: 'bg-[#fde9c4]',
  red: 'bg-[#f8d4d4]',
  grey: 'bg-[#e4e4e0]',
};

export default function Tag({ text, color }: { text: string; color: CrowdingDisplay['color'] }) {
  return (
    <span className={`inline-block rounded-full border border-ink px-[10px] py-[2px] text-xs font-medium text-ink ${colors[color]}`}>
      {text}
    </span>
  );
}
