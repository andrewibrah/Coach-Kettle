/**
 * TermsConsent
 *
 * A consent component shown during sign-up that requires users to
 * acknowledge the Terms of Service and Privacy Policy before creating
 * an account.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import {
  CONSENT_CHECKBOX_TEXT,
  CONSENT_EXPLANATION,
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
} from '@/constants/legal';
import { useThemeColor } from '@/hooks/use-theme-color';

interface TermsConsentProps {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}

type LegalDoc = 'terms' | 'privacy' | null;

export function TermsConsent({ accepted, onAcceptedChange }: TermsConsentProps) {
  const [viewingDoc, setViewingDoc] = useState<LegalDoc>(null);

  const primaryColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  const handleCheckboxPress = () => {
    onAcceptedChange(!accepted);
  };

  const closeModal = () => setViewingDoc(null);

  return (
    <View style={styles.container}>
      {/* Explanation Text */}
      <ThemedText style={styles.explanation}>{CONSENT_EXPLANATION}</ThemedText>

      {/* Links to full documents */}
      <View style={styles.linksContainer}>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={() => setViewingDoc('terms')}
        >
          <ThemedText style={[styles.linkText, { color: primaryColor }]}>
            Read Terms of Service
          </ThemedText>
          <Ionicons name="open-outline" size={14} color={primaryColor} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={() => setViewingDoc('privacy')}
        >
          <ThemedText style={[styles.linkText, { color: primaryColor }]}>
            Read Privacy Policy
          </ThemedText>
          <Ionicons name="open-outline" size={14} color={primaryColor} />
        </Pressable>
      </View>

      {/* Checkbox */}
      <Pressable
        style={styles.checkboxContainer}
        onPress={handleCheckboxPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: accepted ? primaryColor : borderColor },
            accepted && { backgroundColor: primaryColor },
          ]}
        >
          {accepted && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
        <ThemedText style={styles.checkboxText}>{CONSENT_CHECKBOX_TEXT}</ThemedText>
      </Pressable>

      {/* Document Modal */}
      <LegalDocumentModal
        visible={viewingDoc !== null}
        document={viewingDoc}
        onClose={closeModal}
      />
    </View>
  );
}

interface LegalDocumentModalProps {
  visible: boolean;
  document: LegalDoc;
  onClose: () => void;
}

function LegalDocumentModal({ visible, document, onClose }: LegalDocumentModalProps) {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const primaryColor = useThemeColor({}, 'tint');

  const content = document === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY;
  const title = document === 'terms' ? 'Terms of Service' : 'Privacy Policy';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.modalContainer, { backgroundColor }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
          <ThemedText style={styles.modalTitle}>{title}</ThemedText>
          <Pressable
            style={({ pressed }) => [styles.closeButton, pressed && styles.linkPressed]}
            onPress={onClose}
          >
            <Ionicons name="close-circle" size={28} color={textColor} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.modalContent}
          contentContainerStyle={[styles.modalContentInner, { paddingBottom: insets.bottom + 24 }]}
        >
          <MarkdownText content={content} />
        </ScrollView>

        {/* Done Button */}
        <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.doneButton,
              { backgroundColor: primaryColor },
              pressed && styles.linkPressed,
            ]}
            onPress={onClose}
          >
            <ThemedText style={styles.doneButtonText}>Done</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </Modal>
  );
}

/**
 * Simple markdown-like text renderer
 * Handles: # headings, ## subheadings, **bold**, • bullets
 */
function MarkdownText({ content }: { content: string }) {
  const textColor = useThemeColor({}, 'text');

  const lines = content.split('\n');

  return (
    <View>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) {
          return <View key={index} style={styles.spacer} />;
        }

        // H1 heading
        if (trimmed.startsWith('# ')) {
          return (
            <ThemedText key={index} style={styles.h1}>
              {trimmed.slice(2)}
            </ThemedText>
          );
        }

        // H2 heading
        if (trimmed.startsWith('## ')) {
          return (
            <ThemedText key={index} style={styles.h2}>
              {trimmed.slice(3)}
            </ThemedText>
          );
        }

        // H3 heading
        if (trimmed.startsWith('### ')) {
          return (
            <ThemedText key={index} style={styles.h3}>
              {trimmed.slice(4)}
            </ThemedText>
          );
        }

        // Bullet point
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <View key={index} style={styles.bulletContainer}>
              <ThemedText style={styles.bullet}>•</ThemedText>
              <ThemedText style={styles.bulletText}>
                {renderInlineFormatting(trimmed.slice(2))}
              </ThemedText>
            </View>
          );
        }

        // Regular paragraph
        return (
          <ThemedText key={index} style={styles.paragraph}>
            {renderInlineFormatting(trimmed)}
          </ThemedText>
        );
      })}
    </View>
  );
}

/**
 * Handle **bold** text within a line
 */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <ThemedText key={index} style={styles.bold}>
          {part.slice(2, -2)}
        </ThemedText>
      );
    }
    return part;
  });
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  explanation: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    marginBottom: 16,
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  linkPressed: {
    opacity: 0.7,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalContentInner: {
    padding: 20,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  doneButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  // Markdown styles
  spacer: {
    height: 8,
  },
  h1: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 12,
  },
  h2: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletContainer: {
    flexDirection: 'row',
    paddingLeft: 8,
    marginBottom: 6,
  },
  bullet: {
    fontSize: 15,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
});
