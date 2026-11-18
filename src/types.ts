// The public types. Every field is optional except a component's `type`, so a message received from Discord
// (APIMessage) and a body about to be sent (RESTPostAPIChannelMessageJSONBody) both fit. Nothing here imports
// discord-api-types: test/types.test.ts proves the fit instead.

export type Path = number[];

export interface PreviewEmoji {
  id?: string | null;
  name?: string | null;
  animated?: boolean;
}

export interface PreviewUser {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
  member?: PreviewMember;
  public_flags?: number; // 1 << 16 a verified bot
  avatar_decoration_data?: { asset?: string; sku_id?: string } | null;
  primary_guild?: { identity_guild_id?: string | null; identity_enabled?: boolean | null; tag?: string | null; badge?: string | null } | null;
}

// The partial member Discord sends with a guild message.
export interface PreviewMember {
  nick?: string | null;
  roles?: string[];
}

// The deprecated `interaction`, the only place a command's name still comes from.
export interface PreviewMessageInteraction {
  id?: string;
  type?: number;
  name?: string;
  user?: PreviewUser;
}

export interface PreviewMedia {
  url?: string;
  content_type?: string | null;
}

// ---- Components

export interface PreviewButton {
  type: 2;
  style?: number; // 1 primary, 2 secondary, 3 success, 4 danger, 5 link, 6 premium
  label?: string;
  emoji?: PreviewEmoji;
  custom_id?: string;
  url?: string;
  sku_id?: string;
  disabled?: boolean;
}

export interface PreviewSelectOption {
  label?: string;
  value?: string;
  description?: string;
  emoji?: PreviewEmoji;
  default?: boolean;
}

export interface PreviewStringSelect {
  type: 3;
  custom_id?: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  options?: PreviewSelectOption[];
}

// Selects Discord fills in itself: 5 users, 6 roles, 7 users and roles, 8 channels.
export interface PreviewAutoSelect {
  type: 5 | 6 | 7 | 8;
  custom_id?: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  default_values?: { id?: string; type?: string }[];
  channel_types?: number[];
}

export interface PreviewTextInput {
  type: 4;
  custom_id?: string;
  style?: number;
  label?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
}

export interface PreviewActionRow {
  type: 1;
  components?: (PreviewButton | PreviewStringSelect | PreviewAutoSelect | PreviewTextInput)[];
}

export interface PreviewTextDisplay {
  type: 10;
  content?: string;
}

export interface PreviewThumbnail {
  type: 11;
  media?: PreviewMedia;
  description?: string | null;
  spoiler?: boolean;
}

export interface PreviewSection {
  type: 9;
  components?: PreviewTextDisplay[];
  accessory?: PreviewThumbnail | PreviewButton;
}

export interface PreviewMediaGallery {
  type: 12;
  items?: { media?: PreviewMedia; description?: string | null; spoiler?: boolean }[];
}

export interface PreviewFile {
  type: 13;
  file?: PreviewMedia;
  spoiler?: boolean;
  name?: string;
  size?: number;
}

export interface PreviewSeparator {
  type: 14;
  divider?: boolean;
  spacing?: number;
}

export interface PreviewContainer {
  type: 17;
  accent_color?: number | null;
  spoiler?: boolean;
  components?: PreviewComponent[];
}

export interface PreviewLabel {
  type: 18;
  label?: string;
  description?: string;
  component?: PreviewTextInput | PreviewStringSelect | PreviewAutoSelect;
}

export type PreviewComponent =
  | PreviewActionRow
  | PreviewTextDisplay
  | PreviewSection
  | PreviewMediaGallery
  | PreviewFile
  | PreviewSeparator
  | PreviewContainer
  | PreviewLabel;

// ---- Message parts

export interface PreviewEmbed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  author?: { name?: string; url?: string; icon_url?: string };
  footer?: { text?: string; icon_url?: string };
  image?: { url?: string; proxy_url?: string; width?: number; height?: number };
  thumbnail?: { url?: string; proxy_url?: string; width?: number; height?: number };
  fields?: { name?: string; value?: string; inline?: boolean }[];
  video?: { url?: string; proxy_url?: string; width?: number; height?: number };
  provider?: { name?: string; url?: string };
}

export interface PreviewPollMedia {
  text?: string;
  emoji?: PreviewEmoji;
}

// Both shapes: the one sent (`duration` in hours) and the one received (`expiry`, `results`).
export interface PreviewPoll {
  question?: PreviewPollMedia;
  answers?: { answer_id?: number; poll_media?: PreviewPollMedia }[];
  duration?: number;
  expiry?: string | null;
  allow_multiselect?: boolean;
  layout_type?: number;
  results?: { is_finalized?: boolean; answer_counts?: { id?: number; count?: number; me_voted?: boolean }[] };
}

export interface PreviewAttachment {
  id?: string | number;
  filename?: string;
  description?: string;
  content_type?: string;
  size?: number;
  url?: string;
  proxy_url?: string;
  height?: number | null;
  width?: number | null;
  ephemeral?: boolean;
  duration_secs?: number;
  waveform?: string;
  title?: string;
  flags?: number;
}

export interface PreviewStickerItem {
  id?: string;
  name?: string;
  format_type?: number; // 1 PNG, 2 APNG, 3 Lottie, 4 GIF
}

export interface PreviewReaction {
  count?: number;
  me?: boolean;
  me_burst?: boolean;
  emoji?: PreviewEmoji;
  burst_colors?: string[];
  count_details?: { burst?: number; normal?: number };
}

export interface PreviewMessageReference {
  type?: number;
  message_id?: string;
  channel_id?: string;
  guild_id?: string;
}

export interface PreviewInteractionMetadata {
  id?: string;
  type?: number;
  user?: PreviewUser;
  name?: string;
  target_user?: PreviewUser;
  interacted_message_id?: string;
}

export interface PreviewThread {
  id?: string;
  type?: number;
  name?: string | null;
  message_count?: number;
}

export interface PreviewMessage {
  id?: string;
  channel_id?: string;
  type?: number;
  author?: PreviewUser;
  content?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  tts?: boolean;
  flags?: number; // 1 << 15 marks Components V2
  embeds?: PreviewEmbed[];
  components?: PreviewComponent[];
  attachments?: PreviewAttachment[];
  sticker_ids?: string[];
  sticker_items?: PreviewStickerItem[];
  poll?: PreviewPoll;
  reactions?: PreviewReaction[];
  mentions?: PreviewUser[];
  mention_roles?: string[];
  webhook_id?: string;
  referenced_message?: PreviewMessage | null;
  message_reference?: PreviewMessageReference;
  message_snapshots?: { message?: PreviewMessage }[];
  interaction_metadata?: PreviewInteractionMetadata;
  interaction?: PreviewMessageInteraction;
  member?: PreviewMember;
  thread?: PreviewThread;
  call?: { participants?: string[]; ended_timestamp?: string | null };
  role_subscription_data?: { role_subscription_listing_id?: string; tier_name?: string; total_months_subscribed?: number; is_renewal?: boolean };
  purchase_notification?: { type?: number; guild_product_purchase?: { listing_id?: string; product_name?: string } };
}

export interface PreviewModal {
  title?: string;
  custom_id?: string;
  components?: PreviewComponent[];
}

// ---- Props

export interface Resolve {
  users?: Record<string, { name: string; avatar?: string; bot?: boolean; color?: number }>;
  roles?: Record<
    string,
    {
      name: string;
      color?: number;
      position?: number;
      colors?: { primary_color?: number; secondary_color?: number | null; tertiary_color?: number | null };
      icon?: string | null;
      unicode_emoji?: string | null;
    }
  >;
  channels?: Record<string, { name: string; type?: number }>;
  skus?: Record<string, { name: string; price?: string }>;
  guildId?: string; // the @everyone role id, left out of role menus
}

export type Pressed = PreviewButton | { type: 3 | 5 | 6 | 7 | 8; custom_id?: string; picked: string; value: string };

export interface PreviewProps {
  payload: PreviewMessage;
  modal?: PreviewModal; // rendered instead of the message
  resolve?: Resolve;
  theme?: 'dark' | 'light'; // default 'dark'
  mobile?: boolean;
  bare?: boolean; // no channel bar
  channelName?: string; // default: resolve.channels[payload.channel_id]?.name, else 'general'
  interactive?: boolean; // default true
  selected?: Path | null;
  locale?: string;
  timeZone?: string;
  now?: number; // ms; base for "Today at" and relative timestamps; default Date.now()
  localMedia?: boolean; // also show relative, blob: and data:image/ images, for builders previewing their own files; default false
  onPress?: (c: Pressed) => string | void; // a returned string is shown as the ephemeral reply
  onSelectBlock?: (path: Path) => void;
}

export interface DiscordOption {
  value: string;
  label: string;
  description?: string;
  emoji?: PreviewEmoji;
}
