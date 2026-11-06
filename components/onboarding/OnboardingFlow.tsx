import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/brand';
import { useOnboarding } from '@/src/onboarding/OnboardingContext';

const SLIDES = [
  {
    key: 'welcome',
    title: 'Bem-vindo ao Vigintel!',
    body: 'Na Vigintel, você está no controle. Configure sua palavra de segurança e seus contatos de confiança. Em uma emergência, acione o alerta pelo app ou pelo botão de pânico para enviar sua localização imediata.',
    image: require('../../assets/images/onboarding-1.png'),
    aspect: 328 / 378,
  },
  {
    key: 'voice',
    title: 'Proteção à distância de uma palavra.',
    body: 'Segurança máxima sem monitoramento. O processamento de voz do Vigintel é 100% local, garantindo a privacidade dos alertas enquanto mantém seus dados e sua rotina totalmente protegidos.',
    image: require('../../assets/images/onboarding-2.png'),
    aspect: 402 / 416,
  },
  {
    key: 'location',
    title: 'Localização apenas quando importa.',
    body: 'Respeitamos a sua rotina. Sua localização exata só é compartilhada com seus contatos de confiança no instante em que um alerta é disparado.',
    image: require('../../assets/images/onboarding-3.png'),
    aspect: 402 / 484,
  },
  {
    key: 'contacts',
    title: 'Sempre conectado a quem importa.',
    body: 'Confirme quem receberá seus alertas. Seus contatos de emergência serão notificados instantaneamente com sua localização e um pedido de ajuda.',
    image: require('../../assets/images/onboarding-4.png'),
    aspect: 376 / 414,
  },
] as const;

export function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { complete } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const footerBlock = 56 + Math.max(insets.bottom, 12);
  const pageHeight = Math.max(320, height - footerBlock);
  const last = index === SLIDES.length - 1;

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
  };

  const onEnter = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await complete();
    } catch {
      setFinishing(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}>
        {SLIDES.map((slide) => {
          const maxH = pageHeight * 0.46;
          const maxW = width * 0.84;
          let artW = maxW;
          let artH = artW / slide.aspect;
          if (artH > maxH) {
            artH = maxH;
            artW = artH * slide.aspect;
          }

          return (
            <View key={slide.key} style={[styles.page, { width, height: pageHeight }]}>
              <View style={[styles.art, { paddingTop: insets.top + 12 }]}>
                <Image
                  source={slide.image}
                  style={{ width: artW, height: artH }}
                  resizeMode="contain"
                  accessible={false}
                />
              </View>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.side}>
          {index > 0 ? (
            <Pressable
              onPress={() => goTo(index - 1)}
              disabled={finishing}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={8}>
              <Text style={styles.back}>VOLTAR</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.dots}>
          {SLIDES.map((slide, dot) => (
            <View
              key={slide.key}
              style={[styles.dot, dot === index ? styles.dotActive : styles.dotIdle]}
            />
          ))}
        </View>

        <View style={[styles.side, styles.sideEnd]}>
          {last ? (
            <Pressable
              onPress={() => void onEnter()}
              disabled={finishing}
              accessibilityRole="button"
              accessibilityLabel="Entrar"
              hitSlop={8}>
              <Text style={styles.next}>ENTRAR</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => goTo(index + 1)}
              accessibilityRole="button"
              accessibilityLabel="Próximo"
              hitSlop={8}>
              <Text style={styles.next}>PRÓXIMO</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Brand.white,
  },
  pager: {
    flex: 1,
  },
  page: {
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  art: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: Brand.ink,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  side: {
    width: 96,
    minHeight: 44,
    justifyContent: 'center',
  },
  sideEnd: {
    alignItems: 'flex-end',
  },
  dots: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: Brand.blue,
  },
  dotIdle: {
    backgroundColor: '#D5D8E0',
  },
  back: {
    color: '#9AA0AA',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  next: {
    color: Brand.blue,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
