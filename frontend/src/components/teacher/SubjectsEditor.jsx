import React from 'react';
import { Button, Input } from '../ui';
import { Plus, Trash2, BookOpen } from 'lucide-react';

const SubjectsEditor = ({ subjects, setSubjects }) => {
    
    const addSubject = () => {
        setSubjects([...subjects, { name: '', score: 0 }]);
    };

    const removeSubject = (index) => {
        const newSubjects = subjects.filter((_, i) => i !== index);
        setSubjects(newSubjects);
    };

    const handleChange = (index, field, value) => {
        const newSubjects = [...subjects];
        newSubjects[index][field] = field === 'score' ? Number(value) : value;
        setSubjects(newSubjects);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <BookOpen size={18} className="text-[var(--primary)]" />
                    Subject Scores
                </h3>
                <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={addSubject}
                    className="h-8 py-0 flex items-center gap-1 text-xs"
                >
                    <Plus size={14} /> Add Subject
                </Button>
            </div>

            <div className="space-y-3">
                {subjects.map((sub, index) => (
                    <div key={index} className="flex items-end gap-3 animate-slide-in group">
                        <div className="flex-1">
                            <Input 
                                placeholder="Subject Name (e.g. Math)" 
                                value={sub.name}
                                onChange={(e) => handleChange(index, 'name', e.target.value)}
                                required
                            />
                        </div>
                        <div className="w-32">
                            <Input 
                                type="number" 
                                placeholder="Score" 
                                min="0" 
                                max="100"
                                value={sub.score}
                                onChange={(e) => handleChange(index, 'score', e.target.value)}
                                required
                            />
                        </div>
                        <button 
                            type="button"
                            onClick={() => removeSubject(index)}
                            className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all mb-[1px]"
                            title="Remove Subject"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                ))}

                {subjects.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed rounded-xl bg-slate-50 border-slate-200">
                        <p className="text-sm font-semibold text-slate-400">No subjects added yet. Click 'Add Subject' to start.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubjectsEditor;


