import { DiscordPreview, type PreviewProps } from 'discord-preview/react';
import 'discord-preview/style.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureParam, propsFor, replyFor } from '../shared/protocol.ts';

function App({ initial }: { initial: PreviewProps }) {
  const [props, setProps] = useState(initial);
  useEffect(() => {
    (window as unknown as { __setProps: unknown }).__setProps = (p: Partial<PreviewProps>) => setProps((prev) => ({ ...prev, ...p }));
  }, []);
  return <DiscordPreview {...props} onPress={replyFor} onSelectBlock={(selected) => setProps((prev) => ({ ...prev, selected }))} />;
}

createRoot(document.getElementById('preview')!).render(<App initial={propsFor(fixtureParam() ?? 'classic/content')} />);
