import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import { getOffscreenX, shouldDismissCard, SWIPE_THRESHOLD_RATIO } from './gestureUtils';
import { TopCard, TopCardProps } from './TopCard';
import { StackedCard } from './StackedCard';
import { DescriptionCard } from './DescriptionCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ContextType = { startX: number };

export interface UserItem {
  id: string;
  name: string;
  age: number;
  photos: string[];
  about?: string;
}

interface Props {
  data: UserItem[];
  onSwipe?: (params: { direction: 'left' | 'right'; item: UserItem }) => void;
  onEnd?: (index: number) => void;
}

export const CardStack: React.FC<Props> = ({ data, onSwipe, onEnd }) => {
  const index = useSharedValue(0);
  const translateX = useSharedValue(0);

  const gestureHandler = useAnimatedGestureHandler<PanGestureHandlerGestureEvent, ContextType>({
    onStart: (_, ctx) => {
      ctx.startX = translateX.value;
    },
    onActive: (event, ctx) => {
      translateX.value = ctx.startX + event.translationX;
    },
    onEnd: (event) => {
      const shouldDismiss = shouldDismissCard(translateX.value, event.velocityX, SCREEN_WIDTH);
      if (shouldDismiss) {
        const direction = translateX.value > 0 ? 'right' : 'left';
        const toX = getOffscreenX(direction, SCREEN_WIDTH);
        translateX.value = withTiming(toX, { duration: 300 }, () => {
          runOnJS(onEnd?.)(index.value);
          index.value += 1;
          translateX.value = 0;
        });
        runOnJS(onSwipe?.)({ direction, item: data[index.value] });
      } else {
        translateX.value = withSpring(0);
      }
    },
  });

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-12, 0, 12]);
    return {
      transform: [
        { translateX: translateX.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const nextStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / (SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO), 1);
    const rotate = 3 - progress * 3;
    return { transform: [{ rotate: `${rotate}deg` }] };
  });

  const current = data[index.value];
  const next = data[index.value + 1];

  if (!current) return null;

  const topProps: TopCardProps = {
    uri: current.photos[0],
    name: current.name,
    age: current.age,
  };

  return (
    <View style={styles.wrapper}>
      {next && (
        <Animated.View style={[styles.card, nextStyle]}> 
          <StackedCard rotation={2} uri={next.photos[0]}>
            {!next.photos[0] && (
              <DescriptionCard name={next.name} age={next.age} about={next.about} />
            )}
          </StackedCard>
        </Animated.View>
      )}
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={[styles.card, animatedStyle]}> 
          {current.photos[0] ? (
            <TopCard {...topProps} />
          ) : (
            <DescriptionCard name={current.name} age={current.age} about={current.about} />
          )}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    aspectRatio: 0.7,
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
});
