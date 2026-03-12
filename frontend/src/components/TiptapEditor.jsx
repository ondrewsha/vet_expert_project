import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { 
  Bold, Italic, Underline as UnderlineIcon, 
  List, ListOrdered, Undo, Redo 
} from 'lucide-react';
import './TiptapEditor.css';

const MenuBar = ({ editor }) => {
  if (!editor) return null;

  const buttons = [
    { action: () => editor.chain().focus().toggleBold().run(), icon: Bold, active: 'bold', title: 'Жирный' },
    { action: () => editor.chain().focus().toggleItalic().run(), icon: Italic, active: 'italic', title: 'Курсив' },
    { action: () => editor.chain().focus().toggleUnderline().run(), icon: UnderlineIcon, active: 'underline', title: 'Подчеркнутый' },
    { type: 'divider' },
    { action: () => editor.chain().focus().toggleBulletList().run(), icon: List, active: 'bulletList', title: 'Список' },
    { action: () => editor.chain().focus().toggleOrderedList().run(), icon: ListOrdered, active: 'orderedList', title: 'Нумерация' },
    { type: 'divider' },
    { action: () => editor.chain().focus().undo().run(), icon: Undo, title: 'Назад' },
    { action: () => editor.chain().focus().redo().run(), icon: Redo, title: 'Вперед' },
  ];

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-xl">
      {buttons.map((btn, i) => btn.type === 'divider' ? (
        <div key={i} className="w-px h-6 bg-gray-300 mx-1" />
      ) : (
        <button
          key={i}
          type="button"
          onClick={btn.action}
          className={`p-1.5 rounded transition ${editor.isActive(btn.active) ? 'bg-primary text-white' : 'hover:bg-gray-200 text-gray-600'}`}
          title={btn.title}
        >
          <btn.icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

export default function TiptapEditor({ value, onChange, placeholder }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: placeholder || 'Пишите здесь...' }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none max-w-none p-4 min-h-[200px]',
      },
    },
  });

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}