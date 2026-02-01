"use client";

import { useState } from "react";
import { BookOpen, Trash2, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createRule, deleteRule, type Rule } from "@/lib/api";

interface RulesModalProps {
  product: string;
  rules: Rule[];
  onRulesChange: () => void;
}

const CATEGORIES = ["style", "convention", "workflow", "constraint"] as const;

export function RulesModal({ product, rules, onRulesChange }: RulesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newRuleContent, setNewRuleContent] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState<Rule["category"]>("style");
  const [isAdding, setIsAdding] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddRule = async () => {
    if (!newRuleContent.trim()) return;
    
    setIsAdding(true);
    try {
      await createRule(product, newRuleContent.trim(), newRuleCategory);
      setNewRuleContent("");
      setNewRuleCategory("style");
      onRulesChange();
    } catch (err) {
      console.error("Failed to create rule:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteRuleId) return;
    
    setIsDeleting(true);
    try {
      await deleteRule(product, deleteRuleId);
      onRulesChange();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    } finally {
      setIsDeleting(false);
      setDeleteRuleId(null);
    }
  };

  const formatSource = (source: string) => {
    return source === "manual" ? "manual" : "inferred from reviews";
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button className="flex items-center gap-2 w-full text-left p-4 border-t border-border hover:bg-muted/30 transition-colors cursor-pointer">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground flex-1">
              Style Rules
            </span>
            <span className="text-xs text-muted-foreground">{rules.length}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Style Rules for &quot;{product}&quot;</DialogTitle>
          </DialogHeader>
          
          {/* Add New Rule Form */}
          <div className="space-y-3 border border-border rounded p-3">
            <p className="text-xs text-muted-foreground">Add New Rule</p>
            <input
              type="text"
              value={newRuleContent}
              onChange={(e) => setNewRuleContent(e.target.value)}
              placeholder="Enter rule (e.g., Use early returns)"
              className="w-full bg-transparent border border-border rounded px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isAdding) {
                  handleAddRule();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Select
                value={newRuleCategory}
                onValueChange={(val) => setNewRuleCategory(val as Rule["category"])}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddRule}
                disabled={isAdding || !newRuleContent.trim()}
                size="sm"
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add
              </Button>
            </div>
          </div>

          {/* Existing Rules */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Existing Rules ({rules.length})
            </p>
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No rules yet. Add your first rule above.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-auto">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="border border-border rounded p-3 group"
                  >
                    <div className="flex items-start gap-2">
                      <p className="text-sm flex-1">{rule.content}</p>
                      <button
                        onClick={() => setDeleteRuleId(rule.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {rule.category} · applied {rule.times_applied}x · {formatSource(rule.source)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={(open) => !open && setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRule}
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

