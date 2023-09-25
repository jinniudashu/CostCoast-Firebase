export interface ReceiptItem {
  xLabel: string;
  itemId: string;
  name: string;
  price: string;
}

export type Searchable = "Yes" | "No" | "MemberOnly" | "WarehouseOnly" |
  "FoundOneResult" | "StartingBundlePrice" | null;

export interface Subscription {
    memberId: string,
    receiptId: string,
    itemId: string,
    name: string,
    price: string,
    tradeDatetime: string,
}
  
export interface Plan {
  itemId: string,
  price: number | null,
  tradeDatetime: string,
  completed: boolean,
  newPrice?: string | null,
  searchable?: Searchable,
  scrapedDatetime?: Date,
  executionTime?: number,
}

export interface PriceInfo {
  price: string | null,
  searchable: Searchable,
}

export interface Result {
  itemId: string,
  newPrice: number | null,
  searchable: Searchable,
  scrapedDatetime: Date,
  executionTime: number,
}

export interface Notification extends Subscription {
  newPrice: string,
}

export interface CustomerContactInfo {
  email: string,
  phoneNumber: string,
}
