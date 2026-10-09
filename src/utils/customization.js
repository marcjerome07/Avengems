/** Fee applies once per unit when any option differs from the product's default. */
export function getCustomization(product, color, size) {
  const colorChanged = Boolean(product.customizable?.color) && color !== product.color;
  const sizeChanged = Boolean(product.customizable?.size) && size !== product.defaultSize;
  const customized = colorChanged || sizeChanged;
  return { customized, fee: customized ? product.customizationFee : 0, colorChanged, sizeChanged };
}

export function isCustomizable(product) {
  return Boolean(product.customizable?.size || product.customizable?.color);
}
