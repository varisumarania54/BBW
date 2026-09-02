'use strict';

const Discount = require('dw/campaign/Discount');
const Money = require('dw/value/Money');

let CartHelper = {
    /**
     * Get total FREE items in basket
     * @param {basket}
     * @returns Number
     */
    getFreeItemsCount: function (basket) {
        let count = 0;
        if (!empty(basket)) {
            basket.allProductLineItems.toArray().forEach(pli => {
                if (pli.priceAdjustments.size() > 0) {
                    pli.priceAdjustments.toArray().forEach(pAj => {
                        if ('promotionID' in pAj && pAj.promotionID.indexOf('OG-Promo') > -1) {
                            return;
                        }
                        let appliedDiscount = pAj.getAppliedDiscount();
                        if (appliedDiscount.type == Discount.TYPE_FREE || ((appliedDiscount.type == Discount.TYPE_PERCENTAGE || appliedDiscount.type == Discount.TYPE_FIXED_PRICE)
                            && (pli.basePrice.value + (pAj.basePrice.value / pAj.appliedDiscount.quantity) == 0))) {
                            count += appliedDiscount.quantity;
                        }
                    });
                }
            });
        }
        return count;
    },

    /**
     * Determine if product has discounted items which should be displayed as separate lineitem in cart/minicart
     * discounted lineitems can be FREE or with percentage discount
     *
     * @param {pli} : dw.order.ProductLineItem
     * @return {count} : Number discounted items count which should be displayed on separate line
     */
    getDiscountedItemsCount: function (pli) {
        let count = 0,
            affectedDiscountTypes = [Discount.TYPE_FREE, Discount.TYPE_PERCENTAGE];
        if (!empty(pli) && pli.product) {
            pli.priceAdjustments.toArray().forEach(pa => {
                if (affectedDiscountTypes.indexOf(pa.getAppliedDiscount().type) != -1) {
                    count += pa.quantity;
                } else if (Discount.TYPE_FIXED_PRICE.indexOf(pa.getAppliedDiscount().type) != -1
                    && (pli.basePrice.value + pa.basePrice.value == 0)) {
                    count += pa.quantity;
                } else if (Discount.TYPE_FIXED_PRICE.indexOf(pa.getAppliedDiscount().type) != -1
                    && (pli.quantityValue >= pa.quantity)) {
                    count += pa.quantity;
                }
            });
        }
        return count;
    },
    /**
     * Determine if product has discounted items which should be displayed as separate lineitem in cart for a
     * specific price adjustment type
     *
     * @param {pli} : dw.order.ProductLineItem
     * @param {paType} : String of pa type
     * @return {count} : Number discounted items count which should be displayed on separate line
     */
    getDiscountedItemsCountForPA: function (pli, paType) {
        let count = 0;

        if (!empty(pli) && pli.product) {
            pli.priceAdjustments.toArray().forEach(pa => {
                if (Discount[paType].indexOf(pa.getAppliedDiscount().type) != -1
                    && (pli.basePrice.value + pa.basePrice.value == 0)) {
                    count += pa.quantity;
                }
            });
        }
        return count;
    },
    /**
     * Determine if product has discounted items which should be displayed as separate lineitem in cart/minicart
     * discounted lineitems can be FREE or with percentage discount
     *
     * @param {pli} : dw.order.ProductLineItem
     * @return {count} : Number discounted items count which should be displayed on separate line
     */
    getFreeItemsCountInPli: function (pli, lineItemFinalPrice) {
        let count = 0;

        pli.priceAdjustments.toArray().forEach(pa => {
            if ('promotionID' in pa && pa.promotionID.indexOf('OG-Promo') > -1) {
                return;
            }

            if (CartHelper.isFreeTotalPrice(pa, pli, lineItemFinalPrice)) {
                count += pa.quantity;
            }
        });
        return count;
    },
    /**
     * sorts price Adjustments
     *
     *
     */
    sortPriceAdjustments: function (pli) {
        let priceAdjustmentsList: dw.util.List = new dw.util.ArrayList();
        let sortedPriceAdjustmentsList: dw.util.Collection = new dw.util.ArrayList();
        let isFreeItem = false;
        let count = 0;
        pli.priceAdjustments.toArray().forEach(pa => {
            if ('promotionID' in pa && pa.promotionID.indexOf('OG-Promo') > -1) {
                return;
            }

            if (count == 0 && (pli.basePrice.value + (pa.basePrice.value / pa.appliedDiscount.quantity) == 0)) {
                isFreeItem = true;
            }
            priceAdjustmentsList.addAt(count, pa);
            count += 1;
            if (isFreeItem) {
                for (let i = priceAdjustmentsList.size() - 1; i >= 0; i--) {
                    sortedPriceAdjustmentsList.add(priceAdjustmentsList.get(i));
                }
            } else {
                for (let i = 0; i < priceAdjustmentsList.size(); i++) {
                    sortedPriceAdjustmentsList.add(priceAdjustmentsList.get(i));
                }
            }
        });


        return sortedPriceAdjustmentsList;
    },
    /**
     * check if a price adjustment should be displayed as a separate line item
     *
     *
     */
    isLineItem: function (pa, pli) {

        let affectedDiscountTypes = [Discount.TYPE_FREE, Discount.TYPE_PERCENTAGE, Discount.TYPE_AMOUNT];
        let isLine = false
        if (!empty(pa) && !empty(pa.getAppliedDiscount().quantity) && pa.getAppliedDiscount().quantity > 0) {

            if (affectedDiscountTypes.indexOf(pa.getAppliedDiscount().type) != -1
                || (Discount.TYPE_FIXED_PRICE.indexOf(pa.getAppliedDiscount().type) != -1
                    && (pli.basePrice.value + pa.basePrice.value == 0))) {
                isLine = true;
            } else if (Discount.TYPE_FIXED_PRICE.indexOf(pa.getAppliedDiscount().type) != -1
                && (pli.quantityValue >= pa.quantity)) {
                isLine = true;
            }

        }
        return isLine;
    },
    /**
     * check if product total price is free based on promotion and result of CartHelper.getItemPriceTotal() method
     * @param {pa} price adjustment
     * @param {pli} dw.order.ProductLineItem
     * @param {lineItemTotalPrice} dw.value.Money
     * @returns {boolean}
     */
    isFreeTotalPrice: function (pa, pli, lineItemTotalPrice) {
        return (pa.getAppliedDiscount().type == dw.campaign.Discount.TYPE_FREE
            || (!empty(lineItemTotalPrice) && lineItemTotalPrice.value == 0)
            || ((pa.getAppliedDiscount().type == dw.campaign.Discount.TYPE_FIXED_PRICE
                || pa.getAppliedDiscount().type == dw.campaign.Discount.TYPE_PERCENTAGE)
                && (pli.basePrice.value + (pa.basePrice.value / pa.appliedDiscount.quantity) == 0)));
    },

    /**
     * Additional subtract discount for adjusted price for FREE of PERCENTAGE discounted items
     *  this value will be displayed as total price for parent line item if needed discount was applied
     *  @param {pli} : dw.order.ProductLineItem
     *  @param {pa} : dw.order.PriceAdjustment
     */
    getDiscountedLinePrice: function (pli, pa) {
        if (!empty(pli) && pli.product) {
            let adjustedPrice = pli.getAdjustedPrice(),
                itemPrice = pli.basePrice,
                isFreePromo = false,
                isFixedPrice = false,
                isAmountOff = false,
                isPercentagePromo = false;


            let discount = pa.getAppliedDiscount();
            if (pa.getAppliedDiscount().type == Discount.TYPE_PERCENTAGE) {
                itemPrice = itemPrice.subtractPercent(discount.getPercentage()).multiply(discount.quantity);
                itemPrice = Math.abs(adjustedPrice.subtract(itemPrice).value) == (.01 * discount.quantity) ? adjustedPrice : itemPrice;
                isFreePromo = false;
                isPercentagePromo = true;
            } else if (pa.getAppliedDiscount().type == Discount.TYPE_FIXED_PRICE) {
                itemPrice = new dw.value.Money((discount.fixedPrice * discount.quantity), itemPrice.currencyCode);
                itemPrice = Math.abs(adjustedPrice.subtract(itemPrice).value) == (.01 * discount.quantity) ? adjustedPrice : itemPrice;
                isFreePromo = false;
                isFixedPrice = true;
            } else if (pa.getAppliedDiscount().type == Discount.TYPE_AMOUNT) {
                itemPrice = new dw.value.Money(((pli.basePrice - discount.amount) * discount.quantity), itemPrice.currencyCode);
                itemPrice = Math.abs(adjustedPrice.subtract(itemPrice).value) == (.01 * discount.quantity) ? adjustedPrice : itemPrice;
                isFreePromo = false;
                isAmountOff = true;
            } else {
                isFreePromo = true;
            }

            if (isFreePromo) {
                return adjustedPrice;
            } else if (isFixedPrice) {
                return itemPrice;
            } else if (isAmountOff) {
                return itemPrice;
            } else if (isPercentagePromo) {
                return itemPrice;
            } else {
                return adjustedPrice.subtract(itemPrice);
            }
        } else {
            return dw.value.Money.NOT_AVAILABLE;
        }
    },
    getDiscountUnitPrice: function (pli, pa) {
        let basePrice = pli.basePrice;
        return basePrice - (pa.netPrice.multiply(-1).divide(pa.quantity));
    },
    /**
     * Additional subtract discount for adjusted price for FREE of PERCENTAGE discounted items
     *  this value will be displayed as total price for parent line item if needed discount was applied
     *  @param {pli} : dw.order.ProductLineItem
     */
    getDiscountedPrice: function (pli) {
        if (!empty(pli) && pli.product) {
            let adjustedPrice = pli.getAdjustedPrice(),
                itemPrice = pli.basePrice,
                isFreePromo = false,
                isFixedPrice = false;

            pli.priceAdjustments.toArray().forEach(pa => {


                let discount = pa.getAppliedDiscount();
                if (pa.getAppliedDiscount().type == Discount.TYPE_PERCENTAGE) {
                    //adjustedPrice = adjustedPrice.subtract(pa.price);
                    itemPrice = itemPrice
                        .subtractPercent(discount.getPercentage())
                        .multiply(discount.quantity);
                    isFreePromo = false;
                } else if (pa.getAppliedDiscount().type == Discount.TYPE_FIXED_PRICE) {
                    itemPrice = new dw.value.Money((discount.fixedPrice * discount.quantity), itemPrice.currencyCode);
                    isFreePromo = false;
                    isFixedPrice = true;
                } else {
                    isFreePromo = true;
                }
            });
            if (isFreePromo && pli.priceAdjustments.length < 2) {
                return adjustedPrice;
            } else if (isFixedPrice && pli.priceAdjustments.length < 2) {
                return itemPrice;
            } else {
                return adjustedPrice.subtract(itemPrice);
            }
        } else {
            return dw.value.Money.NOT_AVAILABLE;
        }
    },
    /**
     * Calculates the total price of an item based on its pricing logic, including discounts and adjustments.
     *
     * @param {dw.order.ProductLineItem} pli - The Product Line Item (PLI) object containing product and pricing information.
     * @param {dw.order.PriceAdjustment} pa - The pricing adjustment object containing discount details.
     * @param {Number} discountedQty - Quantity of the product eligible for discount.
     * @returns {dw.value.Money} - Returns the calculated total price for the product line item. Returns `dw.value.Money.NOT_AVAILABLE` if invalid parameters or pricing information are encountered.
     */
    getItemPriceTotal: function (pli, pa, discountedQty) {
        if (pli && pli.product) {
            let SalesPrice = pli.basePrice,
                itemPriceTotal = pli.getAdjustedPrice(),
                discount = pa.getAppliedDiscount();
            if (!empty(SalesPrice) && SalesPrice.available && discount.type == Discount.TYPE_PERCENTAGE) {
                if (pli.quantity == discount.quantity) {
                    itemPriceTotal = SalesPrice
                        .subtractPercent(discount.getPercentage())
                        .multiply(discount.quantity);
                } else {
                    if (!empty(discount.quantity)) {
                        itemPriceTotal = SalesPrice.multiply(pli.quantity - discount.quantity);
                    }
                    else {
                        itemPriceTotal = SalesPrice.multiply(pli.quantity - discountedQty);
                    }
                }
            } else if (!empty(SalesPrice) && SalesPrice.available && Discount.TYPE_FIXED_PRICE.indexOf(discount.type) != -1) {
                let discountAmount;
                if (discount.fixedPrice > 0) {
                    discountAmount = new dw.value.Money(discount.fixedPrice * discount.quantity, SalesPrice.currencyCode);
                } else {
                    discountAmount = new dw.value.Money(SalesPrice * (pli.quantityValue - discountedQty), SalesPrice.currencyCode);
                }

                if (pli.quantityValue > discountedQty && discount.fixedPrice > 0) {
                    itemPriceTotal = pli.getAdjustedPrice().subtract(discountAmount);
                } else {
                    itemPriceTotal = discountAmount;
                }
            } else if (!empty(SalesPrice) && SalesPrice.available && Discount.TYPE_AMOUNT.indexOf(discount.type) != -1) {
                if (pli.quantity == discount.quantity) {
                    itemPriceTotal = pli.getAdjustedPrice();
                } else {
                    itemPriceTotal = SalesPrice.multiply(pli.quantity - discount.quantity);
                }
            }
            return itemPriceTotal;
        } else {
            return dw.value.Money.NOT_AVAILABLE;
        }
    },
    returnTrackingParams: function (values) {
        let delimiter = '-_-',
            params = [],
            unqiueID = [];
        // Sort array by index 1 -> 50
        values = values.sort(function (a, b) { return a.index - b.index });
        values.forEach(function (param) {
            // Prevent indexes greater than 50 and negate duplicate indexes
            if (param.index <= 50 && unqiueID.indexOf(param.index) == -1) {
                unqiueID.push(param.index);
                params.push(param.value);
            }
        });
        return delimiter + params.join(delimiter);
    },
    getProductIdsFromBasket: function (basket) {
        let productIds = [];
        basket.getProductLineItems().toArray().forEach(pli => {
            if (productIds.indexOf(pli.getProductID()) == -1) {
                productIds.push(pli.getProductID());
            }
        });
        return productIds;
    },

    getNonFreePriceAdjustment: function (lineitem) {
        if (!empty(lineitem.priceAdjustments)) {
            lineitem.priceAdjustments.toArray().forEach(pa => {
                if (lineitem.basePrice + pa.basePrice !== 0) {
                    return pa
                }
            });

        }
        return null;
    },
    getFakeLineItemData: function (pli) {
        if (!empty(pli)) {
            var newObject = {};
            if (!empty(pli.priceAdjustments)) {
                let lineQtyTotal = pli.getQuantityValue();
                let appliesToAllPA = [];
                pli.priceAdjustments.toArray().sort((a, b) => b.quantity - a.quantity).forEach(pa => {
                    let paItem = {}
                    if (pa.quantity > 0 && pa.quantity < lineQtyTotal) {
                        //Build Fake
                        paItem.priceAdjustment = pa;
                        paItem.quantity = pa.quantity.toFixed();
                        paItem.originalUnitPrice = pli.basePrice.getValue();
                        paItem.discountUnitPrice = pli.basePrice.subtract(pa.netPrice.multiply(-1).divide(pa.quantity)).getValue();
                        paItem.priceAfterItemDiscount = pli.basePrice.subtract(pa.netPrice.multiply(-1).divide(pa.quantity)).multiply(pa.quantity).getValue();
                        lineQtyTotal = lineQtyTotal - pa.quantity
                        appliesToAllPA.forEach(priceAdj => {
                            let paObject = newObject[priceAdj.UUID];
                            paObject.quantity = lineQtyTotal.toFixed();
                            paObject.priceAfterItemDiscount = new Money(paObject.priceAfterItemDiscount, pli.basePrice.currencyCode).subtract(new Money(paItem.priceAfterItemDiscount, pli.basePrice.currencyCode)).getValue()
                            paItem.discountUnitPrice = new Money(paItem.discountUnitPrice, pli.basePrice.currencyCode).add(priceAdj.basePrice.divide(priceAdj.quantity)).getValue();
                            paItem.priceAfterItemDiscount = new Money(paItem.priceAfterItemDiscount, pli.basePrice.currencyCode).add(priceAdj.basePrice.divide(priceAdj.quantity)).getValue()
                        })
                        newObject[pa.UUID] = paItem;
                    }
                    else if (!empty(pli.priceAdjustments)) {
                        let paQuantity = pa.quantity === 0 ? pli.quantity.value : pa.quantity; // Code created promos have no quantity
                        paItem.priceAdjustment = pa;
                        paItem.quantity = paQuantity.toFixed();
                        paItem.originalUnitPrice = pli.basePrice.getValue();
                        paItem.discountUnitPrice = pli.basePrice.subtract(pa.netPrice.multiply(-1).divide(pa.quantity)).getValue();
                        paItem.priceAfterItemDiscount = pli.basePrice.subtract(pa.netPrice.multiply(-1).divide(pa.quantity)).multiply(pa.quantity).getValue();
                        appliesToAllPA.push(pa);
                        newObject[pa.UUID] = paItem;
                    }
                });
            }
            return newObject;
        }
    }
}


module.exports = CartHelper;
