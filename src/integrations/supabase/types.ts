export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: string
          name_en: string
          name_ru: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_en: string
          name_ru: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string
          name_ru?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          bank_account: string
          bank_bik: string
          bank_name: string
          corr_account: string
          delivery_terms: string
          director_name: string
          director_position: string
          email: string
          id: number
          inn: string
          kpp: string
          legal_address: string
          legal_name: string
          offer_text: string
          ogrn: string
          payment_terms: string
          phone: string
          postal_address: string
          short_name: string
          signature_url: string | null
          stamp_url: string | null
          updated_at: string
        }
        Insert: {
          bank_account?: string
          bank_bik?: string
          bank_name?: string
          corr_account?: string
          delivery_terms?: string
          director_name?: string
          director_position?: string
          email?: string
          id?: number
          inn?: string
          kpp?: string
          legal_address?: string
          legal_name?: string
          offer_text?: string
          ogrn?: string
          payment_terms?: string
          phone?: string
          postal_address?: string
          short_name?: string
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
        }
        Update: {
          bank_account?: string
          bank_bik?: string
          bank_name?: string
          corr_account?: string
          delivery_terms?: string
          director_name?: string
          director_position?: string
          email?: string
          id?: number
          inn?: string
          kpp?: string
          legal_address?: string
          legal_name?: string
          offer_text?: string
          ogrn?: string
          payment_terms?: string
          phone?: string
          postal_address?: string
          short_name?: string
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discount_tiers: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          min_boxes: number
        }
        Insert: {
          created_at?: string
          discount_percent: number
          id?: string
          min_boxes: number
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          min_boxes?: number
        }
        Relationships: []
      }
      materials: {
        Row: {
          created_at: string
          id: string
          name_en: string
          name_ru: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name_en: string
          name_ru: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string
          name_ru?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          boxes: number
          created_at: string
          id: string
          line_total: number
          order_id: string
          pieces_per_box: number
          product_name: string
          sku: string
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          boxes: number
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          pieces_per_box: number
          product_name: string
          sku: string
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          boxes?: number
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          pieces_per_box?: number
          product_name?: string
          sku?: string
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          comment: string | null
          created_at: string
          id: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_comment: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          currency: string
          customer_comment: string | null
          delivery_address: string | null
          delivery_date: string | null
          discount_amount: number
          discount_percent: number
          email: string | null
          id: string
          inn: string | null
          order_number: string
          phone: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          total_boxes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_comment?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string
          customer_comment?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          discount_amount?: number
          discount_percent?: number
          email?: string | null
          id?: string
          inn?: string | null
          order_number: string
          phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          total_boxes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_comment?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string
          customer_comment?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          discount_amount?: number
          discount_percent?: number
          email?: string | null
          id?: string
          inn?: string | null
          order_number?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          total_boxes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string | null
          created_at: string
          external_id: string | null
          id: string
          last_synced_at: string | null
          pieces_per_box: number
          price_per_piece_rub: number
          price_per_piece_usd: number
          product_id: string
          reserved_boxes: number
          shape: string | null
          size: string | null
          sku: string
          stock_boxes: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          pieces_per_box?: number
          price_per_piece_rub: number
          price_per_piece_usd: number
          product_id: string
          reserved_boxes?: number
          shape?: string | null
          size?: string | null
          sku: string
          stock_boxes?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          pieces_per_box?: number
          price_per_piece_rub?: number
          price_per_piece_usd?: number
          product_id?: string
          reserved_boxes?: number
          shape?: string | null
          size?: string | null
          sku?: string
          stock_boxes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description_en: string | null
          description_ru: string | null
          id: string
          image_url: string | null
          is_published: boolean
          material_id: string | null
          name_en: string
          name_ru: string
          scent_id: string | null
          shape_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description_en?: string | null
          description_ru?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          material_id?: string | null
          name_en: string
          name_ru: string
          scent_id?: string | null
          shape_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description_en?: string | null
          description_ru?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          material_id?: string | null
          name_en?: string
          name_ru?: string
          scent_id?: string | null
          shape_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_scent_id_fkey"
            columns: ["scent_id"]
            isOneToOne: false
            referencedRelation: "scents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_shape_id_fkey"
            columns: ["shape_id"]
            isOneToOne: false
            referencedRelation: "shapes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          email: string
          id: string
          inn: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email: string
          id: string
          inn?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string
          id?: string
          inn?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scents: {
        Row: {
          created_at: string
          id: string
          name_en: string
          name_ru: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name_en: string
          name_ru: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string
          name_ru?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      shapes: {
        Row: {
          created_at: string
          id: string
          name_en: string
          name_ru: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name_en: string
          name_ru: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string
          name_ru?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          qty_boxes: number
          ref_id: string | null
          source: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          variant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          qty_boxes: number
          ref_id?: string | null
          source?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          variant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          qty_boxes?: number
          ref_id?: string | null
          source?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client"
      order_status:
        | "new"
        | "processing"
        | "invoiced"
        | "paid"
        | "shipped"
        | "completed"
        | "cancelled"
      stock_movement_type:
        | "in"
        | "out"
        | "reserve"
        | "release"
        | "adjust"
        | "sync"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "client"],
      order_status: [
        "new",
        "processing",
        "invoiced",
        "paid",
        "shipped",
        "completed",
        "cancelled",
      ],
      stock_movement_type: [
        "in",
        "out",
        "reserve",
        "release",
        "adjust",
        "sync",
      ],
    },
  },
} as const
