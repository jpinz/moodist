import { MdSpeakerGroup } from 'react-icons/md/index';

import { Item } from '../item';

interface OutputProps {
  open: () => void;
}

export function Output({ open }: OutputProps) {
  return (
    <Item icon={<MdSpeakerGroup />} label="Audio output" onClick={open} />
  );
}
