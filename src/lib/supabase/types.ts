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
      champions: {
        Row: {
          api_name: string
          cost: number
          icon_url: string | null
          name: string
          set_id: number
          traits: string[]
        }
        Insert: {
          api_name: string
          cost: number
          icon_url?: string | null
          name: string
          set_id: number
          traits?: string[]
        }
        Update: {
          api_name?: string
          cost?: number
          icon_url?: string | null
          name?: string
          set_id?: number
          traits?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "champions_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "tft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_units: {
        Row: {
          champion_api_name: string
          comp_id: string
          hex_col: number
          hex_row: number
          is_carry: boolean
          items: string[]
          star_goal: number
        }
        Insert: {
          champion_api_name: string
          comp_id: string
          hex_col: number
          hex_row: number
          is_carry?: boolean
          items?: string[]
          star_goal?: number
        }
        Update: {
          champion_api_name?: string
          comp_id?: string
          hex_col?: number
          hex_row?: number
          is_carry?: boolean
          items?: string[]
          star_goal?: number
        }
        Relationships: [
          {
            foreignKeyName: "comp_units_champion_api_name_fkey"
            columns: ["champion_api_name"]
            isOneToOne: false
            referencedRelation: "champions"
            referencedColumns: ["api_name"]
          },
          {
            foreignKeyName: "comp_units_comp_id_fkey"
            columns: ["comp_id"]
            isOneToOne: false
            referencedRelation: "comps"
            referencedColumns: ["id"]
          },
        ]
      }
      comps: {
        Row: {
          difficulty: number | null
          early_units: string[]
          flex_units: string[]
          guide_md: string | null
          id: string
          is_published: boolean
          name: string
          patch: string
          set_id: number
          slug: string
          sort_order: number
          style: Database["public"]["Enums"]["comp_style"]
          summary: string | null
          tier: Database["public"]["Enums"]["tier_rank"]
          updated_at: string
        }
        Insert: {
          difficulty?: number | null
          early_units?: string[]
          flex_units?: string[]
          guide_md?: string | null
          id?: string
          is_published?: boolean
          name: string
          patch: string
          set_id: number
          slug: string
          sort_order?: number
          style: Database["public"]["Enums"]["comp_style"]
          summary?: string | null
          tier: Database["public"]["Enums"]["tier_rank"]
          updated_at?: string
        }
        Update: {
          difficulty?: number | null
          early_units?: string[]
          flex_units?: string[]
          guide_md?: string | null
          id?: string
          is_published?: boolean
          name?: string
          patch?: string
          set_id?: number
          slug?: string
          sort_order?: number
          style?: Database["public"]["Enums"]["comp_style"]
          summary?: string | null
          tier?: Database["public"]["Enums"]["tier_rank"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comps_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "tft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          api_name: string
          components: string[]
          grants_trait: string | null
          icon_url: string | null
          is_active: boolean
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
        }
        Insert: {
          api_name: string
          components?: string[]
          grants_trait?: string | null
          icon_url?: string | null
          is_active?: boolean
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
        }
        Update: {
          api_name?: string
          components?: string[]
          grants_trait?: string | null
          icon_url?: string | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["item_kind"]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_grants_trait_fkey"
            columns: ["grants_trait"]
            isOneToOne: false
            referencedRelation: "traits"
            referencedColumns: ["api_name"]
          },
        ]
      }
      matches: {
        Row: {
          fetched_at: string
          game_datetime: string
          game_length_s: number
          game_version: string
          match_id: string
          patch: string
          queue_id: number
          raw: Json
          set_number: number
        }
        Insert: {
          fetched_at?: string
          game_datetime: string
          game_length_s: number
          game_version: string
          match_id: string
          patch: string
          queue_id: number
          raw: Json
          set_number: number
        }
        Update: {
          fetched_at?: string
          game_datetime?: string
          game_length_s?: number
          game_version?: string
          match_id?: string
          patch?: string
          queue_id?: number
          raw?: Json
          set_number?: number
        }
        Relationships: []
      }
      player_matches: {
        Row: {
          carry_unit: string | null
          comp_key: string | null
          damage_to_players: number | null
          derived_version: number
          game_datetime: string
          gold_left: number | null
          last_round: number | null
          level: number | null
          match_id: string
          placement: number
          primary_traits: string[]
          puuid: string
          queue_id: number
          set_number: number
          time_eliminated_s: number | null
          traits: Json
          units: Json
        }
        Insert: {
          carry_unit?: string | null
          comp_key?: string | null
          damage_to_players?: number | null
          derived_version?: number
          game_datetime: string
          gold_left?: number | null
          last_round?: number | null
          level?: number | null
          match_id: string
          placement: number
          primary_traits?: string[]
          puuid: string
          queue_id: number
          set_number: number
          time_eliminated_s?: number | null
          traits: Json
          units: Json
        }
        Update: {
          carry_unit?: string | null
          comp_key?: string | null
          damage_to_players?: number | null
          derived_version?: number
          game_datetime?: string
          gold_left?: number | null
          last_round?: number | null
          level?: number | null
          match_id?: string
          placement?: number
          primary_traits?: string[]
          puuid?: string
          queue_id?: number
          set_number?: number
          time_eliminated_s?: number | null
          traits?: Json
          units?: Json
        }
        Relationships: [
          {
            foreignKeyName: "player_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "player_matches_puuid_fkey"
            columns: ["puuid"]
            isOneToOne: false
            referencedRelation: "riot_accounts"
            referencedColumns: ["puuid"]
          },
        ]
      }
      rank_snapshots: {
        Row: {
          captured_at: string
          division: string | null
          id: number
          losses: number | null
          lp: number | null
          puuid: string
          queue_type: string
          tier: string | null
          wins: number | null
        }
        Insert: {
          captured_at?: string
          division?: string | null
          id?: never
          losses?: number | null
          lp?: number | null
          puuid: string
          queue_type: string
          tier?: string | null
          wins?: number | null
        }
        Update: {
          captured_at?: string
          division?: string | null
          id?: never
          losses?: number | null
          lp?: number | null
          puuid?: string
          queue_type?: string
          tier?: string | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rank_snapshots_puuid_fkey"
            columns: ["puuid"]
            isOneToOne: false
            referencedRelation: "riot_accounts"
            referencedColumns: ["puuid"]
          },
        ]
      }
      riot_accounts: {
        Row: {
          game_name: string
          platform: string
          profile_icon_id: number | null
          puuid: string
          summoner_level: number | null
          tag_line: string
          updated_at: string
        }
        Insert: {
          game_name: string
          platform: string
          profile_icon_id?: number | null
          puuid: string
          summoner_level?: number | null
          tag_line: string
          updated_at?: string
        }
        Update: {
          game_name?: string
          platform?: string
          profile_icon_id?: number | null
          puuid?: string
          summoner_level?: number | null
          tag_line?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          last_call_count: number | null
          last_error: string | null
          last_rate_limit: Json | null
          last_started_at: string | null
          last_success_at: string | null
          lock_until: string | null
          next_allowed_at: string | null
          puuid: string
          status: Database["public"]["Enums"]["sync_status"]
        }
        Insert: {
          last_call_count?: number | null
          last_error?: string | null
          last_rate_limit?: Json | null
          last_started_at?: string | null
          last_success_at?: string | null
          lock_until?: string | null
          next_allowed_at?: string | null
          puuid: string
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Update: {
          last_call_count?: number | null
          last_error?: string | null
          last_rate_limit?: Json | null
          last_started_at?: string | null
          last_success_at?: string | null
          lock_until?: string | null
          next_allowed_at?: string | null
          puuid?: string
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_state_puuid_fkey"
            columns: ["puuid"]
            isOneToOne: true
            referencedRelation: "riot_accounts"
            referencedColumns: ["puuid"]
          },
        ]
      }
      tft_sets: {
        Row: {
          id: number
          is_active: boolean
          mutator: string
          name: string
          patch: string | null
        }
        Insert: {
          id: number
          is_active?: boolean
          mutator: string
          name: string
          patch?: string | null
        }
        Update: {
          id?: number
          is_active?: boolean
          mutator?: string
          name?: string
          patch?: string | null
        }
        Relationships: []
      }
      tier_entries: {
        Row: {
          champion_api_name: string | null
          id: number
          item_api_name: string | null
          note: string | null
          position: number
          tier: Database["public"]["Enums"]["tier_rank"]
          tier_list_id: string
        }
        Insert: {
          champion_api_name?: string | null
          id?: never
          item_api_name?: string | null
          note?: string | null
          position?: number
          tier: Database["public"]["Enums"]["tier_rank"]
          tier_list_id: string
        }
        Update: {
          champion_api_name?: string | null
          id?: never
          item_api_name?: string | null
          note?: string | null
          position?: number
          tier?: Database["public"]["Enums"]["tier_rank"]
          tier_list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_entries_champion_api_name_fkey"
            columns: ["champion_api_name"]
            isOneToOne: false
            referencedRelation: "champions"
            referencedColumns: ["api_name"]
          },
          {
            foreignKeyName: "tier_entries_item_api_name_fkey"
            columns: ["item_api_name"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["api_name"]
          },
          {
            foreignKeyName: "tier_entries_tier_list_id_fkey"
            columns: ["tier_list_id"]
            isOneToOne: false
            referencedRelation: "tier_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_lists: {
        Row: {
          id: string
          is_current: boolean
          kind: string
          notes: string | null
          patch: string
          set_id: number | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          id?: string
          is_current?: boolean
          kind: string
          notes?: string | null
          patch: string
          set_id?: number | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_current?: boolean
          kind?: string
          notes?: string | null
          patch?: string
          set_id?: number | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_lists_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "tft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      traits: {
        Row: {
          api_name: string
          breakpoints: Json
          icon_url: string | null
          name: string
          set_id: number
        }
        Insert: {
          api_name: string
          breakpoints: Json
          icon_url?: string | null
          name: string
          set_id: number
        }
        Update: {
          api_name?: string
          breakpoints?: Json
          icon_url?: string | null
          name?: string
          set_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "traits_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "tft_sets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_sync_lock: {
        Args: { p_lock_s?: number; p_puuid: string }
        Returns: {
          last_call_count: number | null
          last_error: string | null
          last_rate_limit: Json | null
          last_started_at: string | null
          last_success_at: string | null
          lock_until: string | null
          next_allowed_at: string | null
          puuid: string
          status: Database["public"]["Enums"]["sync_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "sync_state"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_comp: { Args: { p_comp: Json; p_units: Json }; Returns: string }
    }
    Enums: {
      comp_style:
        | "fast8"
        | "fast9"
        | "reroll_1"
        | "reroll_2"
        | "reroll_3"
        | "flex"
      item_kind:
        | "component"
        | "completed"
        | "emblem"
        | "artifact"
        | "radiant"
        | "support"
        | "other"
      sync_status: "idle" | "running" | "ok" | "error" | "rate_limited"
      tier_rank: "S" | "A" | "B" | "C"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      comp_style: [
        "fast8",
        "fast9",
        "reroll_1",
        "reroll_2",
        "reroll_3",
        "flex",
      ],
      item_kind: [
        "component",
        "completed",
        "emblem",
        "artifact",
        "radiant",
        "support",
        "other",
      ],
      sync_status: ["idle", "running", "ok", "error", "rate_limited"],
      tier_rank: ["S", "A", "B", "C"],
    },
  },
} as const
