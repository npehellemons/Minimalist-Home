export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      calendar_sources: {
        Row: {
          created_at: string;
          enabled: boolean;
          feed_url: string;
          household_id: string;
          id: string;
          name: string;
          profile_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          enabled?: boolean;
          feed_url: string;
          household_id: string;
          id?: string;
          name: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          feed_url?: string;
          household_id?: string;
          id?: string;
          name?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_sources_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_sources_profile_id_household_id_fkey";
            columns: ["profile_id", "household_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id", "household_id"];
          },
        ];
      };
      household_members: {
        Row: {
          created_at: string;
          household_id: string;
          profile_id: string | null;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          household_id: string;
          profile_id?: string | null;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          profile_id?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_members_profile_household_fkey";
            columns: ["profile_id", "household_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id", "household_id"];
          },
        ];
      };
      households: {
        Row: {
          color_mode: string;
          created_at: string;
          created_by: string;
          id: string;
          language: string;
          latitude: number;
          location_name: string;
          longitude: number;
          name: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color_mode?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          language?: string;
          latitude?: number;
          location_name?: string;
          longitude?: number;
          name: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          color_mode?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          language?: string;
          latitude?: number;
          location_name?: string;
          longitude?: number;
          name?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar: string;
          color: string;
          created_at: string;
          household_id: string;
          id: string;
          is_family: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar: string;
          color: string;
          created_at?: string;
          household_id: string;
          id?: string;
          is_family?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          avatar?: string;
          color?: string;
          created_at?: string;
          household_id?: string;
          id?: string;
          is_family?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      task_assignments: {
        Row: {
          created_at: string;
          household_id: string;
          profile_id: string;
          task_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          household_id: string;
          profile_id: string;
          task_id: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          profile_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_profile_id_household_id_fkey";
            columns: ["profile_id", "household_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id", "household_id"];
          },
          {
            foreignKeyName: "task_assignments_task_id_household_id_fkey";
            columns: ["task_id", "household_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "household_id"];
          },
        ];
      };
      task_completions: {
        Row: {
          completed_at: string;
          completed_by: string;
          household_id: string;
          occurrence_date: string;
          profile_id: string;
          task_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string;
          completed_by?: string;
          household_id: string;
          occurrence_date: string;
          profile_id: string;
          task_id: string;
        };
        Update: {
          completed_at?: string;
          completed_by?: string;
          household_id?: string;
          occurrence_date?: string;
          profile_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_completions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_completions_task_id_household_id_profile_id_fkey";
            columns: ["task_id", "household_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "task_assignments";
            referencedColumns: ["task_id", "household_id", "profile_id"];
          },
        ];
      };
      tasks: {
        Row: {
          created_at: string;
          created_by: string;
          day_part: string | null;
          description: string | null;
          due_date: string | null;
          due_time: string | null;
          emoji: string | null;
          household_id: string;
          id: string;
          is_active: boolean;
          kind: string;
          recurrence: string;
          sort_order: number;
          title: string;
          updated_at: string;
          weekdays: number[] | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          day_part?: string | null;
          description?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          emoji?: string | null;
          household_id: string;
          id?: string;
          is_active?: boolean;
          kind: string;
          recurrence?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
          weekdays?: number[] | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          day_part?: string | null;
          description?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          emoji?: string | null;
          household_id?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          recurrence?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          weekdays?: number[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      complete_household_onboarding: {
        Args: {
          household_color_mode: string;
          household_language: string;
          household_latitude: number;
          household_location: string;
          household_longitude: number;
          household_name: string;
          household_profiles: Json;
          household_timezone: string;
        };
        Returns: string;
      };
      create_household: {
        Args: {
          family_name?: string;
          household_language?: string;
          household_latitude?: number;
          household_location?: string;
          household_longitude?: number;
          household_name: string;
          household_timezone?: string;
        };
        Returns: string;
      };
      create_household_invite: {
        Args: {
          invited_profile_id?: string | null;
        };
        Returns: {
          expires_at: string;
          invite_code: string;
        }[];
      };
      create_task: {
        Args: {
          target_household_id: string;
          task_day_part?: string | null;
          task_description?: string | null;
          task_due_date?: string | null;
          task_due_time?: string | null;
          task_emoji?: string | null;
          task_kind: string;
          task_profile_ids: string[];
          task_recurrence?: string | null;
          task_title: string;
          task_weekdays?: number[] | null;
        };
        Returns: string;
      };
      join_household: {
        Args: {
          invite_code: string;
        };
        Returns: string;
      };
      update_task: {
        Args: {
          target_household_id: string;
          target_task_id: string;
          task_day_part?: string | null;
          task_description?: string | null;
          task_due_date?: string | null;
          task_due_time?: string | null;
          task_emoji?: string | null;
          task_kind: string;
          task_profile_ids: string[];
          task_recurrence?: string | null;
          task_title: string;
          task_weekdays?: number[] | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
