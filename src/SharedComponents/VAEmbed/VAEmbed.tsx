import React from 'react';
import { AIStateProvider } from '@redhat-cloud-services/ai-react-state';
import { ChatbotDisplayMode } from '@patternfly/chatbot';
import { Bullseye, Spinner } from '@patternfly/react-core';
import classnames from 'classnames';

import UniversalChatbot from '../../Components/UniversalChatbot/UniversalChatbot';
import useStateManager from '../../aiClients/useStateManager';

import './VAEmbed.scss';

export interface VAEmbedProps {
  /** Callback function called when the virtual assistant should be closed */
  onClose?: () => void;
  /** Additional CSS class name for custom styling */
  className?: string;
}

/**
 * VAEmbed - A version of the Virtual Assistant that can be embedded
 * within other components (e.g., help panels, sidebars) rather than rendered as a floating overlay.
 *
 * Unlike AstroVirtualAssistant which uses createPortal to render to document.body,
 * this component renders inline and can be placed anywhere in the component tree.
 */
const VAEmbed: React.FC<VAEmbedProps> = ({ onClose, className }) => {
  const { currentModel, managers, setCurrentModel } = useStateManager(true);
  const stateManager = managers && currentModel ? managers.find((m) => m.model === currentModel)?.stateManager : undefined;

  // Wait for managers to load (same pattern as AstroVirtualAssistant)
  if (!managers || !currentModel || !stateManager) {
    return (
      <Bullseye>
        <Spinner size="lg" aria-label="Loading Virtual Assistant" />
      </Bullseye>
    );
  }

  return (
    <AIStateProvider stateManager={stateManager}>
      <div className="virtualAssistant" style={{ height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className={classnames('va-embed', className)} style={{ height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <UniversalChatbot
            managers={managers}
            currentModel={currentModel}
            setCurrentModel={setCurrentModel}
            setOpen={() => onClose?.()}
            displayMode={ChatbotDisplayMode.embedded}
          />
        </div>
      </div>
    </AIStateProvider>
  );
};

export default VAEmbed;
