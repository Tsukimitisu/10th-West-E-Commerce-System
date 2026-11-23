import React, { useState } from 'react';
import { optionImageSources } from '../../utils/optionImages.js';

// Reset fallback state as soon as the selected option changes, including when
// two options are switched before a previous image finishes loading.
export default function OptionImage({ src, fallback, alt = '', ...props }) {
  const sources = optionImageSources(src,fallback), key = JSON.stringify(sources);
  const [failed,setFailed] = useState({ key: null,index: 0 });
  const index = failed.key === key ? failed.index : 0;
  return <img {...props} key={`${key}-${index}`} src={sources[index]} alt={alt}
    onError={() => { if (index < sources.length-1) setFailed({ key,index: index+1 }); }} />;
}
