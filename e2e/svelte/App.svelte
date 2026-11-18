<script>
  import 'discord-preview/element';
  import 'discord-preview/style.css';
  import { replyFor } from '../shared/protocol.ts';

  let { initial } = $props();
  let props = $state(initial);
  window.__setProps = (partial) => void (props = { ...props, ...partial });
</script>

<!-- Props by name, not spread: a spread lowercases camelCase names (timeZone becomes an attribute the element ignores) -->
<discord-preview
  payload={props.payload}
  modal={props.modal}
  resolve={props.resolve}
  theme={props.theme}
  mobile={props.mobile}
  bare={props.bare}
  channelName={props.channelName}
  interactive={props.interactive}
  selected={props.selected}
  locale={props.locale}
  timeZone={props.timeZone}
  now={props.now}
  localMedia={props.localMedia}
  twemoji={props.twemoji}
  selectable
  onpress={(e) => e.detail.reply(replyFor(e.detail.component))}
  onselectblock={(e) => (props.selected = e.detail.path)}
></discord-preview>
