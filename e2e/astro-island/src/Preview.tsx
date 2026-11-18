import { DiscordPreview, type PreviewProps } from '@kyzegs/discord-preview/react';
import '@kyzegs/discord-preview/style.css';
import { useEffect, useState } from 'react';
import { replyFor } from '../../shared/protocol.ts';

export default function Preview({ initial }: { initial: PreviewProps }) {
  const [props, setProps] = useState(initial);
  useEffect(() => {
    (window as unknown as { __setProps: unknown }).__setProps = (p: Partial<PreviewProps>) => setProps((prev) => ({ ...prev, ...p }));
  }, []);
  return <DiscordPreview {...props} onPress={replyFor} onSelectBlock={(selected) => setProps((prev) => ({ ...prev, selected }))} />;
}
