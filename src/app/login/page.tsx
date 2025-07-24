"use client";
import React, { useState } from "react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        // TODO: Replace with your authentication logic
        if (!email || !password) {
            setError("Please enter both email and password.");
            return;
        }
        // Simulate login
        alert(`Logged in as ${email}`);
    };

    return (
        <React.Fragment>
            <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-2">
                    <i data-lucide="shopping-cart" className="h-8 w-8 text-white"></i>
                    <h1 className="text-2xl font-bold text-white">GetGoList</h1>
                </div>

                <button 
                    id="themeToggle"
                    className="p-2 rounded-md text-white hover:bg-white/20 transition-colors"
                >
                    <i data-lucide="moon" className="h-5 w-5" id="themeIcon"></i>
                </button>
            </div>

            <div className="flex items-start gap-8 px-6 py-8 max-w-7xl mx-auto flex-wrap lg:flex-nowrap">
                <div className="flex-1 space-y-12 min-w-0">
                    <div className="text-white">
                        <h2 className="text-4xl font-bold mb-4">
                            Transforme suas compras em uma experiência inteligente com GoList
                        </h2>
                        <p className="text-xl text-white/90 mb-8">
                            Organize, compartilhe e economize com o GoList, o app mais completo do Brasil
                        </p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-white/10 backdrop-blur rounded-xl p-6">
                            <div className="text-center">
                                <div className="text-2xl font-bold">500K+</div>
                                <div className="text-sm text-white/80">Usuários</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">2M+</div>
                                <div className="text-sm text-white/80">Listas</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">30%</div>
                                <div className="text-sm text-white/80">Economia</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">4.8★</div>
                                <div className="text-sm text-white/80">Avaliação</div>
                            </div>
                        </div>
                    </div>

                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-white">
                            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                                <i data-lucide="check-circle" className="h-8 w-8"></i>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">GoList Inteligente</h3>
                            <p className="text-white/80 text-sm">Organize suas compras por categorias e nunca mais esqueça nada com o GoList</p>
                        </div>

                        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-white">
                            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                                <i data-lucide="users" className="h-8 w-8"></i>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Compartilhamento Familiar</h3>
                            <p className="text-white/80 text-sm">Sincronize o GoList com toda família em tempo real</p>
                        </div>

                        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-white">
                            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                                <i data-lucide="trending-up" className="h-8 w-8"></i>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Controle de Gastos</h3>
                            <p className="text-white/80 text-sm">Monitore seu orçamento e economize mais a cada compra usando o GoList</p>
                        </div>

                        <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-white">
                            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                                <i data-lucide="clock" className="h-8 w-8"></i>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Modo Offline</h3>
                            <p className="text-white/80 text-sm">Acesse seu GoList mesmo sem internet</p>
                        </div>
                    </div>

                    
                    <div>
                        <h3 className="text-2xl font-bold text-white mb-6 text-center">Escolha seu plano</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            
                            <div className="relative">
                                <div className="plan-gradient-green rounded-xl p-6 text-white h-full">
                                    <div className="flex items-center gap-2 mb-4">
                                        <i data-lucide="star" className="h-6 w-6"></i>
                                        <h4 className="text-xl font-bold">Free</h4>
                                    </div>
                                    <div className="text-2xl font-bold mb-2">Grátis</div>
                                    <p className="text-white/90 text-sm mb-4">Perfeito para começar</p>
                                    <ul className="space-y-2 mb-6">
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            3 GoLists de compras
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Até 50 itens por lista
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Sincronização básica
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Suporte por email
                                        </li>
                                    </ul>
                                    <button className="w-full bg-white text-gray-900 hover:bg-white/90 font-medium py-2 px-4 rounded-md transition-colors">
                                        Começar Grátis
                                    </button>
                                </div>
                            </div>

                            
                            <div className="relative">
                                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black px-3 py-1 rounded-full text-xs font-bold">
                                    MAIS POPULAR
                                </div>
                                <div className="plan-gradient-blue rounded-xl p-6 text-white h-full">
                                    <div className="flex items-center gap-2 mb-4">
                                        <i data-lucide="zap" className="h-6 w-6"></i>
                                        <h4 className="text-xl font-bold">Standard</h4>
                                    </div>
                                    <div className="text-2xl font-bold mb-2">R$ 9,90/mês</div>
                                    <p className="text-white/90 text-sm mb-4">Para uso pessoal completo</p>
                                    <ul className="space-y-2 mb-6">
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            GoLists ilimitadas
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Compartilhamento familiar
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Controle de gastos
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Histórico completo
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Modo offline
                                        </li>
                                    </ul>
                                    <button className="w-full bg-white text-gray-900 hover:bg-white/90 font-medium py-2 px-4 rounded-md transition-colors">
                                        Assinar Agora
                                    </button>
                                </div>
                            </div>

                            
                            <div className="relative">
                                <div className="plan-gradient-purple rounded-xl p-6 text-white h-full">
                                    <div className="flex items-center gap-2 mb-4">
                                        <i data-lucide="crown" className="h-6 w-6"></i>
                                        <h4 className="text-xl font-bold">Plus</h4>
                                    </div>
                                    <div className="text-2xl font-bold mb-2">R$ 19,90/mês</div>
                                    <p className="text-white/90 text-sm mb-4">Para famílias e grupos</p>
                                    <ul className="space-y-2 mb-6">
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Tudo do Standard
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Até 10 usuários
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Relatórios avançados
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Sugestões IA
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Suporte prioritário
                                        </li>
                                        <li className="flex items-center gap-2 text-sm">
                                            <i data-lucide="check-circle" className="h-4 w-4 flex-shrink-0"></i>
                                            Backup automático
                                        </li>
                                    </ul>
                                    <button className="w-full bg-white text-gray-900 hover:bg-white/90 font-medium py-2 px-4 rounded-md transition-colors">
                                        Assinar Agora
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                
                <div className="w-full lg:w-80 flex-shrink-0">
                    <div className="bg-white/95 backdrop-blur rounded-lg shadow-2xl border-0 sticky-top">
                        <div className="p-6 pb-4">
                            <h2 className="text-xl font-bold text-center mb-2">Entrar na sua conta</h2>
                            <p className="text-sm text-gray-600 text-center">Acesse seu GoList e organize melhor sua vida</p>
                        </div>

                        <form id="loginForm" className="px-6">
                            <div className="space-y-4 pb-4">
                                <div className="space-y-2">
                                    <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="seu@email.com"
                                        value="demo@getgolist.com"
                                        required
                                        className="w-full h-11 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="password" className="text-sm font-medium text-gray-700">Senha</label>
                                    <div className="relative">
                                        <input
                                            id="password"
                                            type="password"
                                            placeholder="••••••••"
                                            required
                                            className="w-full h-11 px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <button
                                            type="button"
                                            id="togglePassword"
                                            className="absolute right-0 top-0 h-11 px-3 text-gray-500 hover:text-gray-700"
                                        >
                                            <i data-lucide="eye" className="h-4 w-4" id="eyeIcon"></i>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <input id="remember" type="checkbox" className="rounded border-gray-300" />
                                        <label htmlFor="remember" className="text-sm text-gray-600">Lembrar de mim</label>
                                    </div>
                                    <a href="#" className="text-sm text-blue-600 hover:underline">Esqueceu?</a>
                                </div>
                            </div>

                            <div className="flex flex-col space-y-4 p-6 pt-0">
                                <button
                                    type="submit"
                                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
                                >
                                    Entrar
                                </button>

                                <div className="text-center text-sm text-gray-600">
                                    Não tem conta?
                                    <a href="#" className="text-blue-600 hover:underline font-medium ml-1">Cadastre-se</a>
                                </div>

                                <div className="text-center">
                                    <div className="text-xs text-gray-500 mb-2">Ou continue com</div>
                                    <div className="flex gap-2">
                                        <button type="button" className="flex-1 h-10 border border-gray-300 bg-transparent rounded-md hover:bg-gray-50 transition-colors">
                                            Google
                                        </button>
                                        <button type="button" className="flex-1 h-10 border border-gray-300 bg-transparent rounded-md hover:bg-gray-50 transition-colors">
                                            Facebook
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            
            <footer className="text-center py-6 text-white/60 text-sm border-t border-white/10 mt-12">
                © 2025 GetGoList. Todos os direitos reservados.
            </footer>
        </React.Fragment>
    );
}