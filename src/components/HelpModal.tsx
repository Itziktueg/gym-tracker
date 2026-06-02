interface Section {
  title: string
  body: string
}

interface Props {
  sections: Section[]
  onClose: () => void
}

export default function HelpModal({ sections, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + close */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-8" />
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 text-left"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {sections.map((s, i) => (
            <div key={i}>
              <p className="text-gray-800 font-bold text-sm mb-0.5">{s.title}</p>
              <p className="text-gray-500 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
