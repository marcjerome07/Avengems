// Every piece is tied to one Infinity Stone, so its stone color is fixed (Power = Purple,
// Space = Blue, Reality = Red, Soul = Orange, Time = Green, Mind = Yellow).
// The only customization is size: the fee applies once per unit when the size differs
// from the product's default.

export function getCustomization(product, size) {
  const sizeChanged = Boolean(product.customizable?.size) && size !== product.defaultSize;
  return { customized: sizeChanged, fee: sizeChanged ? product.customizationFee : 0, sizeChanged };
}

export function isCustomizable(product) {
  return Boolean(product.customizable?.size);
}
