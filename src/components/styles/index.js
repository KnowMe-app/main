const width = 200;
const height = 500;

export const layout = {
  window: {
    width,
    height,
  },
};
console.log('height :>> ', height);
console.log('width :>> ', width);

export let resize;
if (height > 1200) {resize = 1.6} 
else if (height > 840 && width > 410) { resize = 1.1; } // Galaxy note 20
else if (height > 830 && width > 410) { resize = 0.78; } // UserPhone, 0.85 завеликі літери на профайл скрін
else if (height > 780 && width > 390) { resize = 0.85; } // Pixel 4 + Xiaomi Redmi Note 8(791*392) 0.95 не гарно 
else if (height > 725 && width > 359) { resize = 0.85; } // S21
else if (width <= 390) { resize = 0.8; } // вузький телефон
else if (height < 600) {resize = 0.8;} // середній розмір
else {resize = 1;} // звичайний розмір

console.log('resize :>> ', resize);

export const deviceWidth = width;
export const deviceHeight = height;

export const statusBarHeight = 10;

export const padding = {
    min:8,
    horizontal: 10,
}

export const color = {
  accent: '#FF6C00',
  accent2: '#FFA500',
  accent3: '#805300',
  accent4: '#F5B901', // як лого
  accent5: '#FF8C00', // коишній темний градієнт
  accent6: 'orange',
  oppositeAccent: '#F6F6F6',
  oppositeAccent2: '#8B4513',
  gray: '#E8E8E8',
  gray2: '#c2bebe',
  gray3: 'gray',
  gray4:'#b3b3b3',
  // black: '#212121',
  black: 'rgba(33, 33, 33, 0.8)',
  blue: '#1B4371',
  red: '#FF2800',
  white: '#FFFFFF',
  ///
  brown: '#A68B70',
  brown2: '#593F26',
  brown3: '#9B4B1A',
  yellow: '#F6C813',
  orange: '#EC9804',
  //

  paleAccent: `#FF6C0055`,
  paleAccent2: '#FFA50030',
  paleAccent5: '#FF8C0055',
  paleYellow: `#F6C81355`,
};


export const fontSize = {
  biggest: 28 * resize,
  bigger: 24 * resize,
  big: 20 * resize,
  regular: 16 * resize,
  small: 14 * resize,
  smallest: 12 * resize,
  smallest2: 10 * resize,
};

export const input = {
  // width: width - width / 10,
  width: '100%',
  // height: 40*resize,
  minHeight: 48,
  marginHorizontal: 16,
  paddingHorizontal: padding.horizontal,
  borderWidth: 1,
  borderRadius: 8,
  borderColor: color.gray,
  backgroundColor: color.oppositeAccent,
  color: color.black,
  fontSize: fontSize.small,
};

export const containerCenter = {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
};

export const shadow = {
  textShadowOffset: { width: 0.5, height: 0.5 },
  textShadowRadius: 1,
};

export const horizontalLine = {
  borderBottomWidth: 1,
  borderBottomColor: color.gray4,
};

export const horizontalLineTop = {
  borderTopWidth: 1,
  borderColor: color.gray4,
};

export const btn = {
  textAlign: 'center',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: 20,
};

export const languageBtn = {
  top: -(deviceHeight * 0.2 - statusBarHeight + 20),
  right: padding.horizontal,
  // alignSelf: 'flex-end',
  position: 'absolute',
};

export const languageBtnLeft = {
  // top: -4,
  right: -4,
  alignSelf: 'flex-start',
};

export const languageBtnProfileScreen = {
  top: 16,
  // top: statusBarHeight+16,
  // left: 16,
  // position: 'absolute',
};

export const row = {
  big: '40%',
  regular: '30%',
  small: '20%',
};

export const svgBtn = {
  width: 48,
  height: 48,
  alignItems: 'center',
  justifyContent: 'center',
};
export const btnText = {
  fontSize:fontSize.regular, 
  color: color.oppositeAccent, 
  textAlign: 'center',
};

export const rowWrap = {
  flexDirection: 'row', 
  flexWrap: 'wrap' 
};